// Roteiro base gerado no aparelho (sem IA). Usa o briefing para os fatos e as
// features de estilo para a linguagem. Também é o gerador do projeto de demonstração.

import { parseBrief, subjectFromBrief, type BriefFacts } from './brief';
import { GENRE_INFO, PLANS, type Genre, type ShotCtx, type ShotTemplate } from './genres';
import type { AudioMode, HookOption, Scene, SceneRole, StructureBeat, StyleFeatures, TargetDuration } from './types';

export type ScriptContext = {
  brief: string;
  features: StyleFeatures;
  targetDuration: TargetDuration;
  audioModes: AudioMode[];
  /** Tipo de conteúdo; sem ele, gastronomia. */
  genre?: Genre;
  /** Estrutura plano a plano da referência principal: o roteiro espelha. */
  structure?: StructureBeat[];
};

type Approach = 'som' | 'pergunta' | 'opiniao' | 'resultado';

let seq = 0;
export const newId = (p: string) => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const FEMININE = /^(carne|costela|picanha|pizza|esfiha|coxinha|tapioca|lasanha|torta|empada|feijoada|moqueca|massa|panqueca|marmita|parmegiana|batata|linguiça|linguica|calabresa|fritura|chapa|massa|sobremesa|salsicha|maminha|fraldinha|alcatra|costelinha|cebola|mussarela|muçarela|burrata|panceta|barriga)/;
const PLURAL = /s$/;

/** Artigo definido com concordância simples (costela → a, xis → o, batatas → as). */
export function articleFor(word: string): string {
  const w = word.trim().toLowerCase().split(' ')[0];
  const fem = FEMININE.test(w) || (/a$/.test(w) && !/(ma|pa)$/.test(w));
  const plural = PLURAL.test(w) && !/^(xis|lápis|lapis|ananás)$/.test(w);
  return (fem ? 'a' : 'o') + (plural ? 's' : '');
}

/** Formas que concordam em gênero/número com a palavra (o/a, do/da, no/na, um/uma…). */
export function forms(word: string) {
  const a = articleFor(word);
  const fem = a.startsWith('a');
  const pl = a.endsWith('s');
  const sfx = (m: string, fe: string) => (fem ? fe : m) + (pl ? 's' : '');
  return {
    o: a,
    do: sfx('do', 'da'),
    no: sfx('no', 'na'),
    um: pl ? (fem ? 'umas' : 'uns') : fem ? 'uma' : 'um',
    esse: sfx('esse', 'essa'),
    pronto: sfx('pronto', 'pronta'),
    inteiro: sfx('inteiro', 'inteira'),
  };
}

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
  return { dish, short, ingredient, station, article: articleFor(ingredient), fs: forms(short), fi: forms(ingredient) };
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
      const { short, station, fs } = n(f);
      return scene('gancho', `Montagem ${station}`, `Filma a montagem ${fs.do} ${short} ${station}, de cima, sem mexer o celular.`, 4, audioFor(c.audioModes, 'som'), {
        tip: 'Apoia o celular em algum lugar firme. O som da cozinha faz o trabalho aqui.',
      });
    },
  ],
  gancho_pergunta: [
    (f, c) => {
      const { short, fs } = n(f);
      const q = f.price ? `Que tamanho de ${short} vem por ${f.price}?` : `Será que ${fs.esse} ${short} vale o que cobram?`;
      return scene('gancho', `Pergunta com ${fs.o} ${short} na mão`, `Segura ${fs.o} ${short} ao lado do rosto, olhando pra câmera, e pergunta.`, 3, audioFor(c.audioModes, 'fala', q), {
        line: q,
        tip: 'Fala a pergunta inteira de uma vez. Se errar, só repete sem cortar.',
      });
    },
  ],
  gancho_opiniao: [
    (f, c) => {
      const { short, fs } = n(f);
      const line = f.place ? `Vim em ${f.place} testar ${fs.um} ${short} que todo mundo comenta.` : `Vim testar ${fs.um} ${short} que todo mundo comenta.`;
      return scene('gancho', 'Você abrindo direto', `Rosto enquadrado do peito pra cima, ${short} na mesa à frente. Uma frase direta.`, 3, audioFor(c.audioModes, 'fala', line), {
        line,
        tip: 'Começa a falar já olhando pra lente, não pra tela.',
      });
    },
  ],
  gancho_resultado: [
    (f, c) => {
      const { short, fs } = n(f);
      return scene('gancho', `${cap(short)} ${fs.pronto}`, `Close ${fs.do} ${short} ${fs.pronto} na mesa. Aproxima devagar com a mão, sem zoom.`, 3, audioFor(c.audioModes, 'som'), {
        tip: 'Chega perto com o corpo, não com o zoom.',
      });
    },
  ],
  escala: [
    (f, c) => {
      const { short, fs } = n(f);
      return scene('escala', `${cap(short)} na mão`, `Mostra ${fs.o} ${short} ${fs.inteiro} na tua mão pra dar escala. Gira devagar uma vez.`, 3, audioFor(c.audioModes, f.price ? 'fala' : 'silencio', f.price ? `Isso aqui é ${f.price}.` : undefined), {
        line: f.price ? `Isso aqui é ${f.price}.` : undefined,
        tip: 'Mão aberta embaixo, sem esconder a lateral. É o tamanho que importa aqui.',
      });
    },
    (f, c) => {
      const { short, fs } = n(f);
      return scene('escala', `${cap(short)} ao lado de algo conhecido`, `Põe ${fs.o} ${short} do lado de um copo ou do celular e filma de lado, na altura da mesa.`, 3, audioFor(c.audioModes, 'silencio'), {
        tip: 'Altura da mesa mostra a altura do recheio.',
      });
    },
  ],
  revelacao: [
    (f, c) => {
      const { short, fs } = n(f);
      return scene('revelacao', `Abrir ${fs.o} ${short} ao meio`, `Abre ${fs.o} ${short} ao meio bem na frente da câmera e mostra o recheio por dentro.`, 3, audioFor(c.audioModes, 'som'), {
        tip: 'Puxa devagar. Se tiver queijo, espera ele esticar antes de parar.',
      });
    },
    (f, c) => {
      const { short, fs } = n(f);
      return scene('revelacao', 'Corte no recheio', `Corta ${fs.o} ${short} com a faca e afasta as metades pra câmera ver as camadas.`, 3, audioFor(c.audioModes, 'som'), {
        tip: 'Celular parado, só as mãos se mexem.',
      });
    },
  ],
  detalhe: [
    (f, c) => {
      const { ingredient, fi } = n(f);
      return scene('detalhe', `Close ${fi.no} ${ingredient}`, `Bem perto ${fi.do} ${ingredient}, foco no detalhe. Movimento lento de um lado pro outro.`, 2, audioFor(c.audioModes, 'som'));
    },
  ],
  mordida: [
    (f, c) => {
      const { short, fs } = n(f);
      return scene('mordida', 'Primeira mordida', `Primeira mordida ${fs.no} ${short}, de frente pra câmera. Continua gravando depois de mastigar.`, 5, audioFor(c.audioModes, 'reacao'), {
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
    title: (f) => (f.price ? `Pergunta do preço com ${n(f).fs.o} ${n(f).short} na mão` : 'Pergunta olhando pra câmera'),
    approach: 'Começa com você olhando pra câmera e fazendo a pergunta que o vídeo responde.',
  },
  opiniao: {
    title: () => 'Você abrindo direto pra câmera',
    approach: 'Começa com o seu rosto e uma frase direta sobre o que você veio testar.',
  },
  resultado: {
    title: (f) => `Close ${n(f).fs.do} ${n(f).short} ${n(f).fs.pronto}`,
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
  if (ctx.genre && ctx.genre !== 'gastronomia') return generateGenreHooks(ctx, ctx.genre);
  const facts = parseBrief(ctx.brief);
  const [a, b] = approachesFor(featuresWithStructure(ctx), facts);
  return [a, b].map((approach, i) => {
    const plan = planFor(approach, facts, ctx.targetDuration);
    const scenes = plan.map((key) => SHOTS[key][0](facts, ctx));
    const extras = ['detalhe', 'contexto', 'escala', 'revelacao', 'fachada'].filter((k) => !plan.includes(k)).map((k) => SHOTS[k][0](facts, ctx));
    const mirrored = mirrorStructure(scenes, extras, ctx);
    return {
      id: newId('gancho'),
      title: HOOK_META[approach].title(facts),
      approach: HOOK_META[approach].approach,
      why: mirrored ? structureWhy(ctx.structure!, i) : i === 0 ? 'É como as suas referências abrem.' : 'Uma alternativa com outro tipo de abertura.',
      scenes: mirrored ?? fitDurations(scenes, ctx.targetDuration, ctx.features),
    };
  });
}

/** Gera outra versão de uma cena com a mesma função, preservando id e clipe. */
export function regenerateSceneLocal(current: Scene, ctx: ScriptContext, variant: number): Scene {
  if (ctx.genre && ctx.genre !== 'gastronomia') return regenerateGenreScene(current, ctx, ctx.genre, variant);
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

// ---------------------------------------------------------------------------
// Outros gêneros: roteiro montado a partir dos planos de cada tipo de conteúdo.

const GUIDANCE = /^(Explica|Comenta|Diz|Nome|Uma frase|O problema|O fato|O que|Um exemplo|O melhor|A primeira|A fala|Fala d)/;

function shotCtx(ctx: ScriptContext, genre: Genre): ShotCtx {
  const facts = parseBrief(ctx.brief);
  const subject = subjectFromBrief(ctx.brief, GENRE_INFO[genre].fallbackSubject);
  return {
    subject,
    s: forms(subject),
    price: facts.price,
    place: facts.place,
    modes: ctx.audioModes,
    wantsVerdict: facts.wantsVerdict,
  };
}

function audioForShot(t: ShotTemplate, modes: AudioMode[], text?: string): { audio: string; line?: string } {
  const fala = modes.includes('fala');
  const narr = modes.includes('narracao');
  if (t.audio === 'som') return { audio: audioFor(modes, 'som') };
  if (t.audio === 'silencio') return { audio: audioFor(modes, 'silencio') };
  if (t.audio === 'reacao') {
    return { audio: fala ? 'Sua fala real, na hora. Sem frase pronta.' : narr ? 'Grava sem falar. Você comenta na narração.' : 'Deixa o som do momento.' };
  }
  if (!text) return { audio: fala ? 'Fala pra câmera.' : narr ? 'A fala entra na narração.' : 'Sem fala.' };
  if (GUIDANCE.test(text) && !text.trim().endsWith('?')) return { audio: fala ? `Fala pra câmera: ${lower1(text)}` : narr ? `Na narração: ${lower1(text)}` : text };
  return { audio: audioFor(modes, 'fala', text), line: fala || narr ? text : undefined };
}

const lower1 = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function buildShot(t: ShotTemplate, sc: ShotCtx): Scene {
  const { audio, line } = audioForShot(t, sc.modes, t.line?.(sc));
  return scene(t.role, t.title(sc), t.instruction(sc), t.duration, audio, { line, tip: t.tip });
}

function wantsTalkFirst(f: StyleFeatures) {
  return f.opening === 'rosto' || f.opening === 'pergunta' || (f.voiceOnset !== null && f.voiceOnset < 1.5);
}

export function generateGenreHooks(ctx: ScriptContext, genre: Exclude<Genre, 'gastronomia'>): HookOption[] {
  const plan = PLANS[genre];
  const sc = shotCtx(ctx, genre);
  const talk = ctx.structure?.length ? ctx.structure[0].voice : wantsTalkFirst(ctx.features);
  const primary = plan.hooks.find((h) => h.kind === (talk ? 'fala' : 'visual')) ?? plan.hooks[0];
  const secondary = plan.hooks.find((h) => h !== primary && h.kind !== primary.kind) ?? plan.hooks.find((h) => h !== primary)!;
  const max = sceneCount(ctx.targetDuration);
  const bodyCount = Math.max(1, Math.min(plan.body.length, max - 2));
  return [primary, secondary].map((h, i) => {
    // O gancho "antes" (beleza) já usa a tomada de antes: não repete no miolo.
    const usable = plan.body.filter((b) => !(h.shot.role === 'antes' && b.role === 'antes'));
    const body = usable.slice(0, bodyCount);
    const scenes = [buildShot(h.shot, sc), ...body.map((b) => buildShot(b, sc)), buildShot(plan.ending, sc)];
    const extras = usable.slice(bodyCount).map((b) => buildShot(b, sc));
    const mirrored = mirrorStructure(scenes, extras, ctx);
    return {
      id: newId('gancho'),
      title: h.title(sc),
      approach: h.approach,
      why: mirrored
        ? structureWhy(ctx.structure!, i)
        : i === 0 ? (talk ? 'Suas referências entram falando.' : 'Suas referências abrem pela imagem.') : 'Uma alternativa com outro tipo de abertura.',
      scenes: mirrored ?? fitDurations(scenes, ctx.targetDuration, ctx.features),
    };
  });
}

function regenerateGenreScene(current: Scene, ctx: ScriptContext, genre: Exclude<Genre, 'gastronomia'>, variant: number): Scene {
  const plan = PLANS[genre];
  const sc = shotCtx(ctx, genre);
  const pool: ShotTemplate[] =
    current.role === 'gancho' || current.role === 'antes'
      ? plan.hooks.map((h) => h.shot)
      : [...plan.body, plan.ending].filter((t) => t.role === current.role);
  const candidates = (pool.length ? pool : plan.body).map((t) => buildShot(t, sc)).filter((s) => s.title !== current.title);
  const pick = candidates.length ? candidates[variant % candidates.length] : buildShot(plan.body[variant % plan.body.length], sc);
  return { ...pick, id: current.id, clipId: current.clipId, duration: current.duration };
}

// ---------------------------------------------------------------------------
// Espelhar a estrutura da referência: mesmo número de planos (proporcional à duração),
// mesmas durações relativas e fala nos mesmos lugares. Os modelos do gênero só dão o conteúdo.

const speaks = (sc: Scene) => !!sc.line || /^(Fala pra câmera|Na narração|Sua fala|A fala entra)/.test(sc.audio);

function featuresWithStructure(ctx: ScriptContext): StyleFeatures {
  if (!ctx.structure?.length) return ctx.features;
  const first = ctx.structure[0];
  return first.voice
    ? { ...ctx.features, voiceOnset: 0.3, opening: ctx.features.opening === 'pergunta' ? 'pergunta' : 'rosto' }
    : { ...ctx.features, voiceOnset: Math.max(2.5, ctx.features.voiceOnset ?? 3), opening: ctx.features.opening === 'rosto' ? 'preparo' : ctx.features.opening };
}

export function mirrorStructure(scenes: Scene[], extras: Scene[], ctx: ScriptContext): Scene[] | null {
  const st = ctx.structure;
  if (!st || !st.length || scenes.length < 2) return null;
  if (st.reduce((a, b) => a + b.duration, 0) < 2) return null;
  const refTotal = st.reduce((a, b) => a + b.duration, 0) || 1;
  const target = ctx.targetDuration;
  // quantas tomadas: as da referência, na proporção da duração alvo (mínimo 3, máximo 10)
  const n = Math.max(3, Math.min(10, Math.round((st.length * target) / refTotal)));
  const beats = Array.from({ length: n }, (_, i) => st[Math.min(st.length - 1, Math.floor((i * st.length) / n))]);
  const hook = scenes[0];
  const ending = scenes[scenes.length - 1];
  const pool = [...scenes.slice(1, -1), ...extras];
  const used = new Set<string>();
  const middle: Scene[] = [];
  for (const beat of beats.slice(1, -1)) {
    const pick = pool.find((sc) => !used.has(sc.id) && speaks(sc) === beat.voice) ?? pool.find((sc) => !used.has(sc.id));
    if (pick) {
      used.add(pick.id);
      middle.push(pick);
    } else {
      middle.push(
        scene(
          beat.voice ? 'reacao' : 'detalhe',
          beat.voice ? 'Comentário rápido' : 'Plano de apoio',
          beat.voice ? 'Uma frase sua sobre o que acabou de mostrar, olhando pra câmera.' : 'Plano curto de detalhe ou do ambiente, ligando uma tomada na outra.',
          2,
          beat.voice ? 'Sua fala real, na hora. Sem frase pronta.' : audioFor(ctx.audioModes, 'som'),
        ),
      );
    }
  }
  // Ordem: tomadas com e sem fala nos mesmos lugares da referência; o miolo mantém a ordem lógica.
  const chosen = [hook, ...middle, ending];
  const weights = beats.map((b) => b.duration);
  const wsum = weights.reduce((a, b) => a + b, 0) || 1;
  return chosen.map((sc, i) => ({ ...sc, duration: Math.max(1, Math.round(((weights[i] / wsum) * target) * 2) / 2) }));
}

function structureWhy(st: StructureBeat[], i: number): string {
  if (i > 0) return 'Mesma estrutura da referência, com outra abertura.';
  const voiced = st.filter((b) => b.voice).length;
  const avg = st.reduce((a, b) => a + b.duration, 0) / st.length;
  if (st.length === 1) return `Segue a referência: um plano contínuo de ${avg.toFixed(0)} s, ${st[0].voice ? 'com fala' : 'sem fala'}. Aqui, tomadas longas e poucas.`;
  return `Segue a referência: ${st.length} planos de ~${avg.toFixed(1).replace('.', ',')} s, ${voiced} com fala, abrindo ${st[0].voice ? 'falando' : 'sem fala'}.`;
}
