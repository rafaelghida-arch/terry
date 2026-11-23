// Roteiro base gerado no aparelho (sem IA). Usa o briefing para os fatos e as
// features de estilo para a linguagem. Também é o gerador do projeto de demonstração.

import { parseBrief, type BriefFacts } from './brief';
import type { AudioMode, HookOption, Scene, SceneRole, StyleFeatures, TargetDuration } from './types';

export type ScriptContext = {
  brief: string;
  features: StyleFeatures;
  targetDuration: TargetDuration;
  audioModes: AudioMode[];
};

type Approach = 'som' | 'pergunta' | 'opiniao' | 'resultado';

let seq = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function nouns(f: BriefFacts) {
  const dish = f.dish ?? 'prato';
  const short = f.dishShort ?? dish.split(' ')[0];
  const ingredient = dish.includes(' de ') ? dish.split(' de ').slice(1).join(' de ') : short;
  const station = /pizza|esfiha|bolo|torta|lasanha|croissant|p[ãa]o/.test(dish)
    ? 'no forno'
    : /sushi|temaki|poke|a[çc]a[ií]|sorvete/.test(dish)
      ? 'na bancada'
      : /pastel|coxinha|churros|salgado|batata|frango frito/.test(dish)
        ? 'no óleo'
        : 'na chapa';
  const article = /^(pizza|esfiha|coxinha|tapioca|lasanha|torta|empada|feijoada|moqueca|massa|panqueca|marmita|costela|picanha|parmegiana)/.test(dish)
    ? 'a'
    : 'o';
  return { dish, short, ingredient, station, article };
}

function audioFor(modes: AudioMode[], kind: 'fala' | 'som' | 'reacao' | 'silencio', line?: string): string {
  const fala = modes.includes('fala');
  const narr = modes.includes('narracao');
  const amb = modes.includes('ambiente');
  if (kind === 'som') return amb || !fala ? 'Só o som do lugar. Nada de fala por cima.' : 'Som do lugar primeiro; a fala entra só na próxima tomada.';
  if (kind === 'silencio') return narr ? 'Grava sem falar. A narração entra por cima depois.' : 'Grava sem falar; o som ambiente fica baixo.';
  if (kind === 'reacao') {
    if (fala) return 'Sua reação real, na hora. Sem frase pronta.';
    if (narr) return 'Grava a reação sem falar. Você comenta na narração.';
    return 'Deixa o som da mordida aparecer.';
  }
  if (fala && line) return `Fala pra câmera: “${line}”`;
  if (narr && line) return `Na narração: “${line}”`;
  return amb ? 'Som ambiente.' : 'Sem fala.';
}

function scene(role: SceneRole, title: string, instruction: string, duration: number, audio: string, extra: Partial<Scene> = {}): Scene {
  return { id: newId('cena'), role, title, instruction, duration, audio, ...extra };
}

type Builder = (f: BriefFacts, c: ScriptContext) => Scene;

const n = (f: BriefFacts) => nouns(f);

// Biblioteca de tomadas. Cada função recebe os fatos do briefing.
const SHOTS: Record<string, Builder[]> = {
  gancho_som: [
    (f, c) => {
      const { ingredient, station, article } = n(f);
      return scene('gancho', `${cap(ingredient)} ${station}`, `Abre com ${article} ${ingredient} ${station}. Câmera bem perto, parada, uns 3 segundos antes de qualquer movimento.`, 4, audioFor(c.audioModes, 'som'), {
        tip: 'Pega uns três segundos do som antes de começar a falar. Dá pra usar esse som na troca de cena.',
      });
    },
    (f, c) => {
      const { short, station } = n(f);
      return scene('gancho', `Montagem ${station}`, `Filma a montagem do ${short} ${station}, de cima, sem mexer o celular.`, 4, audioFor(c.audioModes, 'som'), {
        tip: 'Apoia o celular em algum lugar firme. O som da cozinha faz o trabalho aqui.',
      });
    },
  ],
  gancho_pergunta: [
    (f, c) => {
      const { short } = n(f);
      const q = f.price ? `Que tamanho de ${short} vem por ${f.price}?` : `Será que esse ${short} vale o que cobram?`;
      return scene('gancho', `Pergunta com o ${short} na mão`, `Segura o ${short} ao lado do rosto, olhando pra câmera, e pergunta.`, 3, audioFor(c.audioModes, 'fala', q), {
        line: q,
        tip: 'Fala a pergunta inteira de uma vez. Se errar, só repete sem cortar.',
      });
    },
  ],
  gancho_opiniao: [
    (f, c) => {
      const { short } = n(f);
      const line = f.place ? `Vim em ${f.place} testar um ${short} que todo mundo comenta.` : `Vim testar um ${short} que todo mundo comenta.`;
      return scene('gancho', 'Você abrindo direto', `Rosto enquadrado do peito pra cima, ${short} na mesa à frente. Uma frase direta.`, 3, audioFor(c.audioModes, 'fala', line), {
        line,
        tip: 'Começa a falar já olhando pra lente, não pra tela.',
      });
    },
  ],
  gancho_resultado: [
    (f, c) => {
      const { short } = n(f);
      return scene('gancho', `${cap(short)} pronto`, `Close do ${short} pronto na mesa. Aproxima devagar com a mão, sem zoom.`, 3, audioFor(c.audioModes, 'som'), {
        tip: 'Chega perto com o corpo, não com o zoom.',
      });
    },
  ],
  escala: [
    (f, c) => {
      const { short } = n(f);
      return scene('escala', `${cap(short)} na mão`, `Mostra o ${short} inteiro na tua mão pra dar escala. Gira devagar uma vez.`, 3, audioFor(c.audioModes, f.price ? 'fala' : 'silencio', f.price ? `Isso aqui é ${f.price}.` : undefined), {
        line: f.price ? `Isso aqui é ${f.price}.` : undefined,
        tip: 'Mão aberta embaixo, sem esconder a lateral. É o tamanho que importa aqui.',
      });
    },
    (f, c) => {
      const { short } = n(f);
      return scene('escala', `${cap(short)} ao lado de algo conhecido`, `Põe o ${short} do lado de um copo ou do celular e filma de lado, na altura da mesa.`, 3, audioFor(c.audioModes, 'silencio'), {
        tip: 'Altura da mesa mostra a altura do recheio.',
      });
    },
  ],
  revelacao: [
    (f, c) => {
      const { short } = n(f);
      return scene('revelacao', `Abrir o ${short} ao meio`, `Abre o ${short} ao meio bem na frente da câmera e mostra o recheio por dentro.`, 3, audioFor(c.audioModes, 'som'), {
        tip: 'Puxa devagar. Se tiver queijo, espera ele esticar antes de parar.',
      });
    },
    (f, c) => {
      const { short } = n(f);
      return scene('revelacao', 'Corte no recheio', `Corta o ${short} com a faca e afasta as metades pra câmera ver as camadas.`, 3, audioFor(c.audioModes, 'som'), {
        tip: 'Celular parado, só as mãos se mexem.',
      });
    },
  ],
  detalhe: [
    (f, c) => {
      const { ingredient } = n(f);
      return scene('detalhe', `Close na ${ingredient}`, `Bem perto da ${ingredient}, foco no detalhe. Movimento lento de um lado pro outro.`, 2, audioFor(c.audioModes, 'som'));
    },
  ],
  mordida: [
    (f, c) => {
      const { short } = n(f);
      return scene('mordida', 'Primeira mordida', `Primeira mordida no ${short}, de frente pra câmera. Continua gravando depois de mastigar.`, 5, audioFor(c.audioModes, 'reacao'), {
        tip: 'Deixa essa fala em aberto. Grava e me conta o que você achou na hora.',
      });
    },
  ],
  veredito: [
    (f, c) => {
      const line = f.wantsVerdict ? 'Compraria de novo? Fala o que você achou, com as suas palavras.' : undefined;
      return scene('fechamento', 'Seu veredito', 'Olha pra câmera e responde com a sua opinião de verdade, curta.', 4, f.wantsVerdict ? (c.audioModes.includes('fala') ? 'Fala pra câmera, com a sua opinião real. Sem roteiro.' : 'Grava sua resposta na narração depois.') : audioFor(c.audioModes, 'reacao'), {
        tip: line ? 'Responde o que você sentiu agora. Se for “não sei”, também serve.' : 'Uma frase. Se ficar na dúvida, fala a dúvida.',
      });
    },
  ],
  fachada: [
    (f, c) => scene('fachada', 'Fachada', `Fachada do lugar com o nome visível${f.place ? `, mostrando que é em ${f.place}` : ''}. Pode gravar por último.`, 2, audioFor(c.audioModes, 'som'), {
      tip: 'Pode gravar na saída. Eu encaixo onde ela estiver no roteiro.',
    }),
  ],
  contexto: [
    (f, c) => scene('contexto', 'Mesa e lugar', 'Plano aberto da mesa e do ambiente, 2 segundos, sem pessoas em foco.', 2, audioFor(c.audioModes, 'som')),
  ],
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function approachesFor(features: StyleFeatures, facts: BriefFacts): [Approach, Approach] {
  const voiceFirst = features.voiceOnset !== null && features.voiceOnset < 1.5;
  const faceFirst = features.opening === 'rosto' || features.opening === 'pergunta' || voiceFirst;
  if (faceFirst) {
    const primary: Approach = features.opening === 'pergunta' || facts.price ? 'pergunta' : 'opiniao';
    return [primary, facts.wantsPrep || features.ambientShare > 0.25 ? 'som' : 'resultado'];
  }
  const primary: Approach = features.opening === 'comida' && !facts.wantsPrep ? 'resultado' : 'som';
  return [primary, facts.price ? 'pergunta' : 'opiniao'];
}

const HOOK_META: Record<Approach, { title: (f: BriefFacts) => string; approach: string }> = {
  som: {
    title: (f) => `Abrir pelo som ${n(f).station}`,
    approach: 'Começa sem fala, com o preparo e o som. Você só aparece depois.',
  },
  pergunta: {
    title: (f) => (f.price ? `Pergunta do preço com o ${n(f).short} na mão` : 'Pergunta olhando pra câmera'),
    approach: 'Começa com você olhando pra câmera e fazendo a pergunta que o vídeo responde.',
  },
  opiniao: {
    title: () => 'Você abrindo direto pra câmera',
    approach: 'Começa com o seu rosto e uma frase direta sobre o que você veio testar.',
  },
  resultado: {
    title: (f) => `Close do ${n(f).short} pronto`,
    approach: 'Começa com a comida pronta, de perto, sem fala.',
  },
};

function sceneCount(target: TargetDuration) {
  return target === 15 ? 4 : target === 30 ? 6 : 8;
}

function planFor(approach: Approach, facts: BriefFacts, target: TargetDuration): string[] {
  const body: string[] = [];
  if (approach === 'som') {
    body.push('escala');
    body.push('revelacao');
  } else if (approach === 'pergunta') {
    body.push('revelacao');
    if (facts.wantsScale) body.push('escala');
  } else {
    body.push(facts.wantsScale ? 'escala' : 'revelacao');
    body.push(facts.wantsScale ? 'revelacao' : 'detalhe');
  }
  body.push('mordida');
  if (facts.wantsVerdict || approach !== 'som') body.push('veredito');
  const extras = ['fachada', 'detalhe', 'contexto', 'escala', 'revelacao'];
  const max = sceneCount(target) - 1;
  for (const e of extras) {
    if (body.length >= max) break;
    if (!body.includes(e)) body.splice(e === 'fachada' ? 0 : body.length - 2, 0, e);
  }
  while (body.length > max) {
    const i = body.findIndex((b) => b === 'detalhe' || b === 'contexto' || b === 'fachada');
    body.splice(i >= 0 ? i : body.length - 2, 1);
  }
  return [`gancho_${approach}`, ...body];
}

/** Distribui a duração alvo entre as cenas respeitando o ritmo das referências. */
export function fitDurations(scenes: Scene[], target: number, features: StyleFeatures): Scene[] {
  const paceFactor = features.pace === 'rapido' ? 0.8 : features.pace === 'lento' ? 1.25 : 1;
  const raw = scenes.map((s) => s.duration * paceFactor);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const scale = target / sum;
  return scenes.map((s, i) => ({ ...s, duration: Math.max(1.5, Math.round(raw[i] * scale * 2) / 2) }));
}

export function generateHooksLocal(ctx: ScriptContext): HookOption[] {
  const facts = parseBrief(ctx.brief);
  const [a, b] = approachesFor(ctx.features, facts);
  return [a, b].map((approach, i) => {
    const plan = planFor(approach, facts, ctx.targetDuration);
    const scenes = plan.map((key) => SHOTS[key][0](facts, ctx));
    // Se a abertura é pelo som, a fala da escala vira a primeira fala do vídeo.
    return {
      id: newId('gancho'),
      title: HOOK_META[approach].title(facts),
      approach: HOOK_META[approach].approach,
      why: i === 0 ? 'É como as suas referências abrem.' : 'Uma alternativa com outro tipo de abertura.',
      scenes: fitDurations(scenes, ctx.targetDuration, ctx.features),
    };
  });
}

/** Gera outra versão de uma cena com a mesma função, preservando id e clipe. */
export function regenerateSceneLocal(current: Scene, ctx: ScriptContext, variant: number): Scene {
  const facts = parseBrief(ctx.brief);
  const key =
    current.role === 'gancho'
      ? ['gancho_som', 'gancho_pergunta', 'gancho_opiniao', 'gancho_resultado'][variant % 4]
      : current.role === 'fechamento'
        ? 'veredito'
        : current.role;
  const pool = SHOTS[key] ?? SHOTS.detalhe;
  const fresh = pool[variant % pool.length](facts, ctx);
  const sameText = fresh.title === current.title && pool.length > 1;
  const pick = sameText ? pool[(variant + 1) % pool.length](facts, ctx) : fresh;
  return { ...pick, id: current.id, clipId: current.clipId, duration: current.duration };
}

export function blankScene(): Scene {
  return scene('detalhe', 'Nova tomada', 'Descreve o que filmar.', 3, 'Som ambiente.');
}
