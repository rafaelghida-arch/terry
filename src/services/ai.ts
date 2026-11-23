// Cliente do backend do TERRY. A chave da Anthropic fica no servidor; o app manda
// só quadros JPEG pequenos e medidas — nunca os vídeos inteiros.
import { File } from 'expo-file-system';
import type { Reference, Scene, SceneRole, StyleFeatures } from '../domain/types';

const API_URL = (process.env.EXPO_PUBLIC_TERRY_API_URL ?? '').replace(/\/$/, '');
const APP_TOKEN = process.env.EXPO_PUBLIC_TERRY_APP_TOKEN ?? '';

export type AiStatus = 'ligada' | 'sem_servidor' | 'sem_chave' | 'fora_do_ar';

export class AiUnavailableError extends Error {
  constructor(public reason: Exclude<AiStatus, 'ligada'>, message?: string) {
    super(message ?? reason);
  }
}

async function request<T>(path: string, body?: unknown, timeoutMs = 120_000): Promise<T> {
  if (!API_URL) throw new AiUnavailableError('sem_servidor');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', ...(APP_TOKEN ? { 'x-terry-token': APP_TOKEN } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) throw new AiUnavailableError('sem_chave', data.error);
    if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof AiUnavailableError) throw e;
    if (e instanceof Error && (e.name === 'AbortError' || /Network request failed|fetch/i.test(e.message))) {
      throw new AiUnavailableError('fora_do_ar', 'Não consegui falar com o servidor do TERRY.');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function aiStatus(): Promise<AiStatus> {
  if (!API_URL) return 'sem_servidor';
  try {
    const h = await request<{ ai: boolean }>('/health', undefined, 6000);
    return h.ai ? 'ligada' : 'sem_chave';
  } catch (e) {
    return e instanceof AiUnavailableError ? e.reason : 'fora_do_ar';
  }
}

export type AiAnalysis = {
  perReference: {
    referenceId: string;
    opening: StyleFeatures['opening'];
    foodBeforeSpeech: boolean | null;
    faceOnCamera: boolean | null;
    foodFirstAt: number | null;
    faceFirstAt: number | null;
    ending: StyleFeatures['ending'];
    talkStyle: StyleFeatures['talkStyle'];
    summary: string;
  }[];
  observations: { text: string; referenceIds: string[] }[];
  divergent: boolean;
  terryLine: string | null;
  model: string;
};

/** Resume o envelope de volume a cada 0,5 s para mandar pouco dado. */
function loudness(rmsDb: number[], win: number): number[] {
  const step = Math.max(1, Math.round(0.5 / win));
  const out: number[] = [];
  for (let i = 0; i < rmsDb.length; i += step) {
    const slice = rmsDb.slice(i, i + step);
    out.push(Math.round(Math.max(...slice)));
  }
  return out;
}

export async function analyzeReferencesAI(brief: string, refs: Reference[]): Promise<AiAnalysis> {
  const references = await Promise.all(
    refs.map(async (r) => {
      const m = r.metrics!;
      const frames = await Promise.all(
        (r.frames ?? []).slice(0, 8).map(async (f) => ({ t: f.t, data: await new File(f.uri).base64() })),
      );
      return {
        id: r.id,
        name: r.name,
        metrics: {
          duration: m.duration,
          cuts: m.cuts,
          avgShot: m.avgShot,
          firstShot: m.firstShot,
          voiceOnset: m.voiceOnset,
          ambientShare: m.ambientShare,
          silenceShare: m.silenceShare,
          hasAudio: m.hasAudio,
          loudness: loudness(m.rmsDb, m.audioWindow),
        },
        frames,
      };
    }),
  );
  return request<AiAnalysis>('/v1/analyze', { brief, references });
}

type ScriptCtx = {
  brief: string;
  targetDuration: number;
  audioModes: string[];
  features: StyleFeatures;
  observations: string[];
  primaryReference?: string | null;
};

type AiScene = { role: SceneRole; title: string; instruction: string; duration: number; audio: string; line: string | null; tip: string | null };

export async function generateScriptAI(ctx: ScriptCtx) {
  return request<{ hooks: { title: string; approach: string; why: string; scenes: AiScene[] }[]; model: string }>('/v1/script', ctx);
}

export async function regenerateSceneAI(ctx: ScriptCtx, scenes: Scene[], index: number) {
  return request<{ scene: AiScene }>('/v1/scene', {
    ...ctx,
    scenes: scenes.map((s) => ({ role: s.role, title: s.title, instruction: s.instruction, duration: s.duration })),
    index,
  });
}

export const aiConfigured = () => Boolean(API_URL);
