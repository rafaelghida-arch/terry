// Análise de estilo feita no aparelho, a partir das medidas do módulo nativo.
// Ela só afirma o que foi medido: duração dos planos, quando entra a voz, quanto som ambiente existe.

import type { Observation, Reference, ReferenceMetrics, ReferenceStyle, StyleAnalysis, StyleFeatures } from './types';

export type RawAnalysis = {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  cuts: number[];
  rmsDb: number[];
  zcr: number[];
  audioWindow: number;
  frames: { t: number; uri: string }[];
};

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const percentile = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))];
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Classifica janelas de áudio em silêncio / som / voz provável.
 * Voz: energia acima do ruído de fundo, com modulação silábica (variação rápida de volume)
 * e taxa de cruzamentos por zero moderada. Chiado de chapa tende a ser constante e com ZCR alta.
 */
export function classifyAudio(rmsDb: number[], zcr: number[], win: number) {
  const n = rmsDb.length;
  const labels: ('silencio' | 'som' | 'voz')[] = new Array(n).fill('silencio');
  if (!n) return { labels, voiceOnset: null as number | null, ambientShare: 0, silenceShare: 1 };
  const floor = percentile(rmsDb, 0.1);
  const loudGate = Math.max(-55, floor + 8);
  const span = Math.max(2, Math.round(0.8 / win)); // ~0,8 s de contexto
  for (let i = 0; i < n; i++) {
    if (rmsDb[i] < loudGate) continue;
    const a = Math.max(0, i - span);
    const b = Math.min(n, i + span + 1);
    const local = rmsDb.slice(a, b);
    const mod = std(local);
    const z = zcr[i] ?? 0;
    labels[i] = mod > 4.5 && z > 0.015 && z < 0.22 ? 'voz' : 'som';
  }
  // Voz precisa durar: exige 4 janelas de voz em ~1 s para marcar o início.
  let voiceOnset: number | null = null;
  const need = Math.max(3, Math.round(0.4 / win));
  const look = Math.max(need, Math.round(1 / win));
  for (let i = 0; i < n; i++) {
    let c = 0;
    for (let j = i; j < Math.min(n, i + look); j++) if (labels[j] === 'voz') c++;
    if (labels[i] === 'voz' && c >= need) {
      voiceOnset = i * win;
      break;
    }
  }
  const som = labels.filter((l) => l === 'som').length;
  const sil = labels.filter((l) => l === 'silencio').length;
  return { labels, voiceOnset, ambientShare: som / n, silenceShare: sil / n };
}

export function metricsFromRaw(raw: RawAnalysis): ReferenceMetrics {
  const cuts = raw.cuts.filter((c) => c > 0.25 && c < raw.duration - 0.25).sort((a, b) => a - b);
  const bounds = [0, ...cuts, raw.duration];
  const shotLengths: number[] = [];
  for (let i = 1; i < bounds.length; i++) shotLengths.push(bounds[i] - bounds[i - 1]);
  const audio = raw.hasAudio
    ? classifyAudio(raw.rmsDb, raw.zcr, raw.audioWindow)
    : { voiceOnset: null, ambientShare: 0, silenceShare: 1 };
  return {
    duration: raw.duration,
    width: raw.width,
    height: raw.height,
    hasAudio: raw.hasAudio,
    cuts,
    shotLengths,
    avgShot: mean(shotLengths),
    firstShot: shotLengths[0] ?? raw.duration,
    rmsDb: raw.rmsDb,
    zcr: raw.zcr,
    audioWindow: raw.audioWindow,
    voiceOnset: audio.voiceOnset,
    ambientShare: audio.ambientShare,
    silenceShare: audio.silenceShare,
  };
}

export function paceOf(avgShot: number): StyleFeatures['pace'] {
  if (avgShot < 1.6) return 'rapido';
  if (avgShot < 3.2) return 'medio';
  return 'lento';
}

/** Features que dá para inferir só com medidas. Campos visuais ficam como null. */
export function featuresFromMetrics(m: ReferenceMetrics): StyleFeatures {
  const soundFirst = m.voiceOnset === null || m.voiceOnset > 2;
  const talkStyle: StyleFeatures['talkStyle'] =
    m.voiceOnset === null ? 'sem_fala' : m.ambientShare > 0.35 ? 'misto' : 'fala_camera';
  return {
    opening: soundFirst ? 'preparo' : 'rosto',
    foodBeforeSpeech: null,
    faceOnCamera: null,
    avgShot: r1(m.avgShot),
    pace: paceOf(m.avgShot),
    ambientShare: Math.round(m.ambientShare * 100) / 100,
    voiceOnset: m.voiceOnset === null ? null : r1(m.voiceOnset),
    ending: 'corte_seco',
    talkStyle,
  };
}

export function combineFeatures(list: StyleFeatures[]): StyleFeatures {
  if (list.length === 1) return list[0];
  const avgShot = r1(mean(list.map((f) => f.avgShot)));
  const voices = list.map((f) => f.voiceOnset).filter((v): v is number => v !== null);
  const pick = <T,>(arr: T[]): T => {
    const counts = new Map<T, number>();
    arr.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const allBool = (k: 'foodBeforeSpeech' | 'faceOnCamera') => {
    const v = list.map((f) => f[k]);
    if (v.some((x) => x === null)) return null;
    return v.every(Boolean) ? true : v.every((x) => !x) ? false : null;
  };
  return {
    opening: pick(list.map((f) => f.opening)),
    foodBeforeSpeech: allBool('foodBeforeSpeech'),
    faceOnCamera: allBool('faceOnCamera'),
    avgShot,
    pace: paceOf(avgShot),
    ambientShare: Math.round(mean(list.map((f) => f.ambientShare)) * 100) / 100,
    voiceOnset: voices.length === list.length ? r1(mean(voices)) : voices.length ? r1(Math.min(...voices)) : null,
    ending: pick(list.map((f) => f.ending)),
    talkStyle: pick(list.map((f) => f.talkStyle)),
  };
}

/** Referências divergem quando uma abre pelo som e outra pela fala, ou o ritmo muda muito. */
export function isDivergent(list: StyleFeatures[]): boolean {
  if (list.length < 2) return false;
  const soundFirst = list.map((f) => f.voiceOnset === null || f.voiceOnset > 2);
  if (soundFirst.some((v) => v !== soundFirst[0])) return true;
  const shots = list.map((f) => f.avgShot).filter((v) => v > 0);
  if (shots.length >= 2 && Math.max(...shots) / Math.min(...shots) > 2.2) return true;
  const openings = new Set(list.map((f) => f.opening));
  return openings.has('rosto') && (openings.has('comida') || openings.has('preparo'));
}

const countWord = (n: number) => (n === 2 ? 'Nos dois vídeos' : n === 3 ? 'Nos três vídeos' : 'No vídeo');

let obsSeq = 0;
const obsId = () => `obs_${Date.now().toString(36)}_${(obsSeq++).toString(36)}`;

/** Observações verdadeiras a partir das medidas. Nada visual é afirmado aqui. */
export function localObservations(refs: Reference[]): Observation[] {
  const ms = refs.map((r) => r.metrics).filter((m): m is ReferenceMetrics => !!m);
  if (!ms.length) return [];
  const ids = refs.map((r) => r.id);
  const n = ms.length;
  const out: Observation[] = [];
  const add = (text: string) => out.push({ id: obsId(), text, source: 'medido', enabled: true, referenceIds: ids });

  const avg = mean(ms.map((m) => m.avgShot));
  add(`Os planos duram em média ${r1(avg).toString().replace('.', ',')} s. ${avg < 1.6 ? 'Ritmo rápido, muito corte.' : avg < 3.2 ? 'Ritmo médio.' : 'Planos longos, sem pressa.'}`);

  const silentStart = ms.filter((m) => m.hasAudio && (m.voiceOnset === null || m.voiceOnset > 2));
  if (silentStart.length === n && n > 0) {
    const first = Math.min(...silentStart.map((m) => m.voiceOnset ?? m.duration));
    add(
      `${countWord(n)}, ninguém fala nos primeiros ${Math.max(2, Math.floor(first))} segundos. A abertura fica com o som do lugar.`,
    );
  } else {
    const quick = ms.filter((m) => m.voiceOnset !== null && m.voiceOnset < 1);
    if (quick.length === n) add(`${countWord(n)}, a voz entra logo no primeiro segundo.`);
  }

  const amb = mean(ms.map((m) => m.ambientShare));
  if (amb > 0.3) add(`Tem bastante espaço para som ambiente: cerca de ${Math.round(amb * 100)}% do tempo sem fala.`);
  else if (ms.every((m) => m.voiceOnset !== null) && amb < 0.12) add('A fala ocupa quase tudo. Pouco respiro de som ambiente.');

  const firstShots = ms.map((m) => m.firstShot);
  if (firstShots.every((f) => f > 2.5)) add(`O primeiro plano segura por ${r1(mean(firstShots)).toString().replace('.', ',')} s antes do primeiro corte.`);

  const durs = ms.map((m) => m.duration);
  add(`Duração das referências: ${durs.map((d) => `${Math.round(d)} s`).join(', ')}.`);
  return out;
}

/** Fala do TERRY sobre o achado mais concreto — só quando ele é verdadeiro para todas as referências. */
export function terryLineFor(combined: StyleFeatures, perRef: StyleFeatures[]): string | null {
  const n = perRef.length;
  if (perRef.every((f) => f.foodBeforeSpeech === true)) {
    return `${countWord(n)}, a comida aparece antes de alguém falar. Quer abrir o teu assim também?`;
  }
  if (perRef.every((f) => f.opening === 'pergunta')) {
    return `${countWord(n)}, abre com uma pergunta direto pra câmera. Quer começar assim?`;
  }
  if (perRef.every((f) => f.voiceOnset === null || f.voiceOnset > 2)) {
    return `${countWord(n)}, os primeiros segundos são só som. Quer abrir o teu sem falar também?`;
  }
  if (perRef.every((f) => f.voiceOnset !== null && f.voiceOnset < 1)) {
    return `${countWord(n)}, a fala entra logo de cara. Quer abrir falando também?`;
  }
  if (combined.pace === 'rapido') return 'Muito corte curto nas suas referências. Vou pensar as tomadas curtinhas.';
  return null;
}

export function localAnalysis(refs: Reference[]): StyleAnalysis {
  const perReference: ReferenceStyle[] = refs
    .filter((r) => r.metrics)
    .map((r) => {
      const f = featuresFromMetrics(r.metrics!);
      return {
        referenceId: r.id,
        features: f,
        summary: `${f.pace === 'rapido' ? 'Corte rápido' : f.pace === 'medio' ? 'Ritmo médio' : 'Planos longos'}, ${
          f.voiceOnset === null ? 'sem fala detectada' : f.voiceOnset > 2 ? `voz entra em ${f.voiceOnset}s` : 'fala logo no início'
        }.`,
      };
    });
  const feats = perReference.map((p) => p.features);
  const combined = feats.length ? combineFeatures(feats) : defaultFeatures();
  return {
    source: 'local',
    createdAt: Date.now(),
    perReference,
    combined,
    observations: localObservations(refs),
    divergent: isDivergent(feats),
    terryLine: feats.length ? terryLineFor(combined, feats) : null,
    referenceIds: refs.map((r) => r.id),
  };
}

export function defaultFeatures(): StyleFeatures {
  return {
    opening: 'preparo',
    foodBeforeSpeech: null,
    faceOnCamera: null,
    avgShot: 2.5,
    pace: 'medio',
    ambientShare: 0.3,
    voiceOnset: null,
    ending: 'corte_seco',
    talkStyle: 'misto',
  };
}

/** A análise guardada ainda vale se as referências não mudaram. */
export function analysisIsCurrent(analysis: StyleAnalysis | undefined, refs: Reference[]): boolean {
  if (!analysis) return false;
  const a = [...analysis.referenceIds].sort().join('|');
  const b = refs.map((r) => r.id).sort().join('|');
  return a === b;
}

/** Features usadas para o roteiro: a referência principal, se houver divergência. */
export function effectiveFeatures(analysis: StyleAnalysis, primaryId?: string): StyleFeatures {
  if (analysis.divergent && primaryId) {
    const p = analysis.perReference.find((r) => r.referenceId === primaryId);
    if (p) return p.features;
  }
  return analysis.combined;
}

/**
 * Converte as diferenças entre quadros consecutivos em instantes de corte.
 * diffs[i] compara a amostra i com a i+1 (instante (i+1)*interval).
 */
export function cutsFromDiffs(diffs: number[], interval: number): number[] {
  if (diffs.length < 3) return [];
  const med = percentile(diffs, 0.5);
  const threshold = Math.max(0.11, med * 3.5, mean(diffs) + 2 * std(diffs));
  const cuts: number[] = [];
  for (let i = 0; i < diffs.length; i++) {
    const d = diffs[i];
    if (d < threshold) continue;
    if (d < (diffs[i - 1] ?? 0) || d < (diffs[i + 1] ?? 0)) continue;
    const t = (i + 1) * interval;
    if (cuts.length && t - cuts[cuts.length - 1] < 0.4) continue;
    cuts.push(Math.round(t * 100) / 100);
  }
  return cuts;
}
