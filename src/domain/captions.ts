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
export function timelineCaptions(project: Pick<Project, 'scenes' | 'clips' | 'skippedSceneIds'>): TimelineCue[] {
  const tl = buildTimeline(project);
  const out: TimelineCue[] = [];
  for (const seg of tl.segments) {
    for (const c of seg.clip.captions ?? []) {
      const a = Math.max(c.start, seg.start);
      const b = Math.min(c.end, seg.end);
      if (b - a < 0.15 || !c.text.trim()) continue;
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
