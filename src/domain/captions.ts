// Legendas: opcionais, editáveis, presas ao clipe (no tempo do arquivo original).
// Assim elas acompanham o clipe quando o criador apara, reordena ou troca a ordem das cenas.

import { newId } from './scriptLocal';
import type { CaptionCue, CaptionSettings, Clip, Project, Scene } from './types';
import { buildTimeline, clipRange } from './timeline';

export const DEFAULT_CAPTIONS: CaptionSettings = { enabled: false, style: 'faixa', position: 'baixo' };

const WORDS_PER_SECOND = 2.6;
const MAX_WORDS = 6;

/** Quebra um texto em blocos curtos, sem cortar no meio de uma ideia quando dá. */
export function chunkText(text: string, maxWords = MAX_WORDS): string[] {
  const clean = text.replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?:;])\s+/);
  const out: string[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(' ');
    for (let i = 0; i < words.length; ) {
      const left = words.length - i;
      // evita sobrar uma palavra sozinha no fim
      const take = left <= maxWords ? left : left <= maxWords + 2 ? Math.ceil(left / 2) : maxWords;
      out.push(words.slice(i, i + take).join(' '));
      i += take;
    }
  }
  return out;
}

/**
 * Rascunho de legenda a partir da fala planejada da cena. O criador corrige para o que falou de verdade.
 * `voiceOnset` (se medido) diz quando a fala começa no clipe.
 */
export function draftCaptions(clip: Clip, scene: Pick<Scene, 'line'>, voiceOnset: number | null = null): CaptionCue[] {
  if (!scene.line) return [];
  const chunks = chunkText(scene.line);
  if (!chunks.length) return [];
  const { start, end } = clipRange(clip);
  const begin = Math.min(end - 0.5, Math.max(start + 0.2, voiceOnset ?? start + 0.3));
  const words = chunks.reduce((n, c) => n + c.split(' ').length, 0);
  const speech = Math.min(end - begin, Math.max(1, words / WORDS_PER_SECOND));
  let t = begin;
  return chunks.map((text) => {
    const d = (speech * text.split(' ').length) / words;
    const cue = { id: newId('leg'), start: round(t), end: round(Math.min(end, t + d)), text };
    t += d;
    return cue;
  });
}

const round = (n: number) => Math.round(n * 100) / 100;

export type TimelineCue = { clipId: string; cueId: string; start: number; end: number; text: string };

/** Legendas no tempo do vídeo montado (só o que cai dentro do trecho usado de cada clipe). */
export function timelineCaptions(project: Pick<Project, 'scenes' | 'clips' | 'skippedSceneIds'>, includeEmpty = false): TimelineCue[] {
  const tl = buildTimeline(project);
  const out: TimelineCue[] = [];
  for (const seg of tl.segments) {
    for (const c of seg.clip.captions ?? []) {
      const a = Math.max(c.start, seg.start);
      const b = Math.min(c.end, seg.end);
      if (b - a < 0.15 || (!includeEmpty && !c.text.trim())) continue;
      out.push({ clipId: seg.clip.id, cueId: c.id, start: round(seg.offset + a - seg.start), end: round(seg.offset + b - seg.start), text: c.text.trim() });
    }
  }
  return out.sort((x, y) => x.start - y.start);
}

export function cueAt(cues: TimelineCue[], t: number): TimelineCue | undefined {
  return cues.find((c) => t >= c.start && t < c.end);
}

/** Converte um instante da montagem para o tempo do clipe. */
export function toClipTime(project: Pick<Project, 'scenes' | 'clips' | 'skippedSceneIds'>, t: number): { clipId: string; time: number; segEnd: number } | null {
  const tl = buildTimeline(project);
  for (const seg of tl.segments) {
    if (t >= seg.offset && t < seg.offset + seg.duration) return { clipId: seg.clip.id, time: seg.start + (t - seg.offset), segEnd: seg.end };
  }
  return null;
}

export function newCue(start: number, end: number, text: string): CaptionCue {
  return { id: newId('leg'), start: round(start), end: round(end), text };
}

/** Agrupa palavras com tempo (transcrição) em legendas curtas, quebrando em pausas e pontuação. */
export function cuesFromWords(words: { text: string; start: number; end: number }[], range: { start: number; end: number }): CaptionCue[] {
  const inRange = words.filter((w) => w.end > range.start && w.start < range.end && w.text.trim());
  const out: CaptionCue[] = [];
  let cur: typeof inRange = [];
  const flush = () => {
    if (!cur.length) return;
    out.push(newCue(Math.max(range.start, cur[0].start), Math.min(range.end, cur[cur.length - 1].end + 0.15), cur.map((w) => w.text.trim()).join(' ')));
    cur = [];
  };
  for (const w of inRange) {
    const gap = cur.length ? w.start - cur[cur.length - 1].end : 0;
    if (cur.length >= MAX_WORDS || gap > 0.6) flush();
    cur.push(w);
    if (/[.!?;:]$/.test(w.text.trim())) flush();
  }
  flush();
  // sem sobreposição
  for (let i = 1; i < out.length; i++) if (out[i].start < out[i - 1].end) out[i - 1].end = out[i].start;
  return out;
}

/**
 * Texto transcrito sem tempo (Android): distribui as palavras pelos trechos em que há voz,
 * na ordem, proporcional à duração de cada trecho.
 */
export function cuesFromText(text: string, voiced: { start: number; end: number }[], range: { start: number; end: number }): CaptionCue[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (!words.length) return [];
  let spans = voiced.map((v) => ({ start: Math.max(range.start, v.start), end: Math.min(range.end, v.end) })).filter((v) => v.end - v.start > 0.2);
  if (!spans.length) spans = [{ start: range.start + 0.2, end: range.end }];
  const total = spans.reduce((a, v) => a + (v.end - v.start), 0);
  const perWord = total / words.length;
  const timed: { text: string; start: number; end: number }[] = [];
  let si = 0;
  let t = spans[0].start;
  for (const w of words) {
    if (t + perWord > spans[si].end + 1e-6 && si < spans.length - 1) {
      si++;
      t = spans[si].start;
    }
    timed.push({ text: w, start: t, end: t + perWord });
    t += perWord;
  }
  return cuesFromWords(timed, range);
}

/** Trechos com voz a partir das janelas de áudio classificadas. */
export function voicedSpans(labels: ('silencio' | 'som' | 'voz')[], win: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  let open: number | null = null;
  let gap = 0;
  labels.forEach((l, i) => {
    if (l === 'voz') {
      if (open === null) open = i;
      gap = 0;
    } else if (open !== null && ++gap > Math.round(0.5 / win)) {
      out.push({ start: open * win, end: (i - gap + 1) * win });
      open = null;
      gap = 0;
    }
  });
  if (open !== null) out.push({ start: open * win, end: (labels.length - gap) * win });
  return out;
}

/** Legendas vazias no tempo de cada trecho com voz (para o criador escrever o que falou). */
export function placeholderCues(spans: { start: number; end: number }[], range: { start: number; end: number }): CaptionCue[] {
  const out: CaptionCue[] = [];
  for (const sp of spans) {
    let a = Math.max(range.start, sp.start);
    const b = Math.min(range.end, sp.end);
    while (b - a > 0.3) {
      const e = Math.min(b, a + 2.5);
      out.push(newCue(a, e, ''));
      a = e;
    }
  }
  return out;
}
