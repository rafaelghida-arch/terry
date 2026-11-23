// Backend do TERRY: guarda a chave da Anthropic e faz as chamadas de IA.
// Recebe só o necessário: quadros JPEG pequenos + medidas feitas no aparelho. Nenhum vídeo bruto.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { ANALYZE_TASK, SCENE_TASK, SCRIPT_TASK, SYSTEM_BASE } from './prompts';

const PORT = Number(process.env.PORT ?? 8787);
const MODEL = process.env.TERRY_MODEL ?? 'claude-opus-5-5';
const APP_TOKEN = process.env.TERRY_APP_TOKEN ?? '';
const MAX_BODY = 20 * 1024 * 1024;

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasKey ? new Anthropic() : null;

// ---------- schemas ----------

const Opening = z.enum(['comida', 'preparo', 'rosto', 'pergunta', 'ambiente', 'fachada']);
const Ending = z.enum(['veredito', 'mordida', 'corte_seco', 'chamada']);
const TalkStyle = z.enum(['fala_camera', 'narracao', 'sem_fala', 'misto']);
const Role = z.enum(['gancho', 'preparo', 'escala', 'revelacao', 'detalhe', 'mordida', 'reacao', 'fachada', 'contexto', 'fechamento']);

const AnalysisSchema = z.object({
  perReference: z.array(
    z.object({
      referenceId: z.string(),
      opening: Opening,
      foodBeforeSpeech: z.boolean().nullable(),
      faceOnCamera: z.boolean().nullable(),
      foodFirstAt: z.number().nullable(),
      faceFirstAt: z.number().nullable(),
      ending: Ending,
      talkStyle: TalkStyle,
      summary: z.string(),
    }),
  ),
  observations: z.array(z.object({ text: z.string(), referenceIds: z.array(z.string()) })),
  divergent: z.boolean(),
  terryLine: z.string().nullable(),
});

const SceneSchema = z.object({
  role: Role,
  title: z.string(),
  instruction: z.string(),
  duration: z.number(),
  audio: z.string(),
  line: z.string().nullable(),
  tip: z.string().nullable(),
});

const ScriptSchema = z.object({
  hooks: z.array(
    z.object({
      title: z.string(),
      approach: z.string(),
      why: z.string(),
      scenes: z.array(SceneSchema),
    }),
  ),
});

// ---------- entrada ----------

const MetricsIn = z.object({
  duration: z.number(),
  cuts: z.array(z.number()),
  avgShot: z.number(),
  firstShot: z.number(),
  voiceOnset: z.number().nullable(),
  ambientShare: z.number(),
  silenceShare: z.number(),
  hasAudio: z.boolean(),
  loudness: z.array(z.number()).optional(), // envelope resumido (0,5 s)
});

const AnalyzeIn = z.object({
  brief: z.string().max(2000),
  references: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        metrics: MetricsIn,
        frames: z.array(z.object({ t: z.number(), data: z.string() })).max(10),
      }),
    )
    .min(1)
    .max(3),
});

const ContextIn = z.object({
  brief: z.string().max(2000),
  targetDuration: z.number(),
  audioModes: z.array(z.string()),
  features: z.record(z.string(), z.unknown()),
  observations: z.array(z.string()).max(12),
  primaryReference: z.string().nullable().optional(),
});

const SceneIn = ContextIn.extend({
  scenes: z.array(z.object({ role: z.string(), title: z.string(), instruction: z.string(), duration: z.number() })),
  index: z.number().int(),
});

// ---------- chamadas ----------

type Usage = { input_tokens: number; output_tokens: number };
function logUsage(route: string, usage: Usage) {
  // Preço de referência do claude-opus-5-5: US$ 4 / 1M entrada, US$ 20 / 1M saída.
  const cost = (usage.input_tokens * 4 + usage.output_tokens * 20) / 1_000_000;
  console.log(`[${route}] in=${usage.input_tokens} out=${usage.output_tokens} ≈ US$ ${cost.toFixed(4)}`);
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callClaude<T extends z.ZodType>(route: string, schema: T, content: Anthropic.Beta.Messages.BetaContentBlockParam[], effort: 'low' | 'medium' | 'high') {
  if (!client) throw new HttpError(503, 'Análise por IA indisponível: servidor sem chave configurada.');
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_BASE,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  logUsage(route, res.usage);
  if (res.stop_reason === 'refusal') throw new HttpError(422, 'A IA recusou esse pedido. Tente reescrever o briefing.');
  if (res.stop_reason === 'max_tokens') throw new HttpError(502, 'Resposta incompleta da IA. Tente de novo.');
  if (!res.parsed_output) throw new HttpError(502, 'Resposta da IA fora do formato.');
  return res.parsed_output as z.infer<T>;
}

async function analyze(body: unknown) {
  const input = AnalyzeIn.parse(body);
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    { type: 'text', text: `Briefing do criador (contexto apenas; não use para descrever as referências):\n${input.brief}` },
  ];
  for (const ref of input.references) {
    const m = ref.metrics;
    content.push({
      type: 'text',
      text: [
        `### Referência ${ref.id} ("${ref.name}")`,
        `Duração: ${m.duration.toFixed(1)} s. Cortes em: ${m.cuts.map((c) => c.toFixed(1)).join(', ') || 'nenhum detectado'}.`,
        `Plano médio: ${m.avgShot.toFixed(1)} s. Primeiro plano: ${m.firstShot.toFixed(1)} s.`,
        `Áudio: ${m.hasAudio ? `voz provável a partir de ${m.voiceOnset === null ? 'nenhum ponto (sem fala detectada)' : `${m.voiceOnset.toFixed(1)} s`}; ${Math.round(m.ambientShare * 100)}% do tempo com som sem fala; ${Math.round(m.silenceShare * 100)}% em silêncio.` : 'sem trilha de áudio.'}`,
        m.loudness ? `Volume (dBFS a cada 0,5 s): ${m.loudness.map((v) => Math.round(v)).join(' ')}` : '',
        'Quadros a seguir:',
      ].join('\n'),
    });
    for (const f of ref.frames) {
      content.push({ type: 'text', text: `t=${f.t.toFixed(1)} s` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } });
    }
  }
  content.push({ type: 'text', text: ANALYZE_TASK });
  const out = await callClaude('analyze', AnalysisSchema, content, 'medium');
  return { ...out, model: MODEL };
}

function contextText(c: z.infer<typeof ContextIn>) {
  return [
    `Briefing (fonte dos fatos): ${c.brief}`,
    `Duração alvo: ${c.targetDuration} s. Modos de áudio: ${c.audioModes.join(', ')}.`,
    `Estilo das referências (linguagem): ${JSON.stringify(c.features)}`,
    c.primaryReference ? `Referência principal escolhida pelo criador: ${c.primaryReference}` : '',
    `Observações aprovadas pelo criador:\n- ${c.observations.join('\n- ') || '(nenhuma)'}`,
  ].join('\n');
}

async function script(body: unknown) {
  const input = ContextIn.parse(body);
  const out = await callClaude('script', ScriptSchema, [{ type: 'text', text: `${contextText(input)}\n\n${SCRIPT_TASK}` }], 'medium');
  if (out.hooks.length < 2) throw new HttpError(502, 'A IA trouxe menos de duas opções. Tente de novo.');
  return { hooks: out.hooks.slice(0, 2), model: MODEL };
}

async function scene(body: unknown) {
  const input = SceneIn.parse(body);
  const list = input.scenes.map((s, i) => `${i === input.index ? '>>' : '  '} ${i + 1}. [${s.role}] ${s.title} — ${s.instruction} (${s.duration}s)`).join('\n');
  const out = await callClaude('scene', SceneSchema, [{ type: 'text', text: `${contextText(input)}\n\nRoteiro atual:\n${list}\n\nTomada a reescrever: ${input.index + 1}.\n${SCENE_TASK}` }], 'low');
  return { scene: out, model: MODEL };
}

// ---------- http ----------

const hits = new Map<string, { n: number; at: number }>();
function rateLimit(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.at > 60_000) return hits.set(ip, { n: 1, at: now }), true;
  h.n++;
  return h.n <= 20;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Envio grande demais'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new HttpError(400, 'JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

const routes: Record<string, (b: unknown) => Promise<unknown>> = {
  '/v1/analyze': analyze,
  '/v1/script': script,
  '/v1/scene': scene,
};

export const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, ai: hasKey, model: MODEL });
    const handler = req.method === 'POST' && req.url ? routes[req.url] : undefined;
    if (!handler) return send(res, 404, { error: 'Rota não encontrada' });
    if (APP_TOKEN && req.headers['x-terry-token'] !== APP_TOKEN) return send(res, 401, { error: 'Token do app inválido' });
    if (!rateLimit(req.socket.remoteAddress ?? '?')) return send(res, 429, { error: 'Muitas requisições. Espera um minuto.' });
    if (!hasKey) return send(res, 503, { error: 'Análise por IA indisponível: servidor sem chave configurada.', code: 'no_key' });
    const body = await readBody(req);
    send(res, 200, await handler(body));
  } catch (e) {
    if (e instanceof z.ZodError) return send(res, 400, { error: 'Dados inválidos', issues: e.issues.slice(0, 5) });
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: 'IA ocupada agora. Tente de novo em instantes.' });
    if (e instanceof Anthropic.AuthenticationError) return send(res, 503, { error: 'Chave da IA inválida no servidor.' });
    if (e instanceof Anthropic.APIError) return send(res, 502, { error: `Erro da IA (${e.status ?? '?'})` });
    console.error(e);
    send(res, 500, { error: 'Erro interno' });
  }
});

if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`TERRY backend em http://0.0.0.0:${PORT} — IA ${hasKey ? `ligada (${MODEL})` : 'DESLIGADA (sem ANTHROPIC_API_KEY)'}`);
  });
}
