import { zoomFor } from './look';
import type { Clip, CropRect, Framing, Project, Scene } from './types';

export const OUTPUT = { width: 1080, height: 1920, fps: 30 } as const;
const ASPECT = OUTPUT.width / OUTPUT.height; // 9:16

export const DEFAULT_FRAMING: Framing = { x: 0, y: 0, zoom: 1 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Converte o enquadramento (deslocamento -1..1, zoom) em um retângulo normalizado
 * sobre o quadro orientado. O mesmo retângulo é usado na prévia e na exportação nativa.
 */
export function cropRectFor(width: number, height: number, framing: Framing = DEFAULT_FRAMING): CropRect {
  if (width <= 0 || height <= 0) return { left: 0, top: 0, width: 1, height: 1 };
  const zoom = clamp(framing.zoom || 1, 1, 4);
  let cw: number;
  let ch: number;
  if (width / height > ASPECT) {
    ch = height;
    cw = height * ASPECT;
  } else {
    cw = width;
    ch = width / ASPECT;
  }
  cw /= zoom;
  ch /= zoom;
  const x = clamp(framing.x, -1, 1);
  const y = clamp(framing.y, -1, 1);
  const cx = width / 2 + (x * (width - cw)) / 2;
  const cy = height / 2 + (y * (height - ch)) / 2;
  return {
    left: (cx - cw / 2) / width,
    top: (cy - ch / 2) / height,
    width: cw / width,
    height: ch / height,
  };
}

/** Quanto o enquadramento pode se mover em cada eixo (para esconder controles inúteis). */
export function framingFreedom(width: number, height: number, zoom = 1) {
  const r = cropRectFor(width, height, { x: 0, y: 0, zoom });
  return { horizontal: r.width < 0.999, vertical: r.height < 0.999 };
}

export type Segment = {
  sceneId: string;
  sceneIndex: number;
  clip: Clip;
  start: number; // dentro do clipe
  end: number;
  offset: number; // posição na linha do tempo
  duration: number;
};

export type Timeline = {
  segments: Segment[];
  total: number;
  missing: Scene[]; // cenas sem clipe e não dispensadas
  skipped: Scene[];
};

export function clipRange(clip: Clip) {
  const start = clamp(clip.trimStart, 0, clip.duration);
  const end = clamp(clip.trimEnd > 0 ? clip.trimEnd : clip.duration, start, clip.duration);
  return { start, end };
}

/** Monta a ordem aprovada: cada cena com clipe vira um segmento, com corte seco. */
export function buildTimeline(project: Pick<Project, 'scenes' | 'clips' | 'skippedSceneIds'>): Timeline {
  const segments: Segment[] = [];
  const missing: Scene[] = [];
  const skipped: Scene[] = [];
  let offset = 0;
  project.scenes.forEach((scene, sceneIndex) => {
    const clip = scene.clipId ? project.clips[scene.clipId] : undefined;
    if (!clip) {
      if (project.skippedSceneIds.includes(scene.id)) skipped.push(scene);
      else missing.push(scene);
      return;
    }
    const { start, end } = clipRange(clip);
    const duration = end - start;
    if (duration < 0.1) return;
    segments.push({ sceneId: scene.id, sceneIndex, clip, start, end, offset, duration });
    offset += duration;
  });
  return { segments, total: offset, missing, skipped };
}

export function segmentAt(timeline: Timeline, t: number): { index: number; local: number } | null {
  if (!timeline.segments.length) return null;
  for (let i = 0; i < timeline.segments.length; i++) {
    const s = timeline.segments[i];
    if (t < s.offset + s.duration - 1e-3) return { index: i, local: s.start + Math.max(0, t - s.offset) };
  }
  const last = timeline.segments.length - 1;
  return { index: last, local: timeline.segments[last].end };
}

/**
 * Sugere um trecho quando o clipe é bem mais longo que a cena pede.
 * `voiceOnset` (se medido) ajuda a não cortar a entrada da fala.
 */
export function suggestTrim(
  clipDuration: number,
  scene: Pick<Scene, 'duration' | 'role'>,
  voiceOnset: number | null = null,
): { start: number; end: number; trimmed: boolean } {
  const want = Math.max(1, scene.duration);
  // Mordida e reação ficam mais longas: a reação real não tem hora pra acabar.
  const slack = scene.role === 'mordida' || scene.role === 'reacao' ? 2.2 : 1.5;
  if (clipDuration <= want * slack) return { start: 0, end: clipDuration, trimmed: false };
  const length = scene.role === 'mordida' || scene.role === 'reacao' ? want * 1.6 : want;
  let start = Math.min(0.4, clipDuration * 0.05); // pula o tranco do toque no botão
  if (voiceOnset !== null && voiceOnset > 0.6) start = Math.max(0, voiceOnset - 0.5);
  if (start + length > clipDuration) start = Math.max(0, clipDuration - length);
  return { start: round2(start), end: round2(Math.min(clipDuration, start + length)), trimmed: true };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function formatPrecise(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, '0')}`;
}

/** Especificação enviada ao módulo nativo de exportação. */
export type ExportSpec = {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  segments: { uri: string; start: number; end: number; crop: CropRect; volume: number; hasAudio: boolean; zoom?: { from: number; to: number } }[];
  narration?: { uri: string; volume: number; duration: number };
  /** Legendas já no tempo do vídeo montado (só quando o criador ativou). */
  captions?: { cues: { start: number; end: number; text: string }[]; style: 'faixa' | 'contorno'; position: 'baixo' | 'meio'; color: string };
  music?: { uri: string; volume: number };
};

export function buildExportSpec(project: Project, outputPath: string): ExportSpec {
  const tl = buildTimeline(project);
  const segments = tl.segments.map((s, i) => ({
    uri: s.clip.uri,
    start: s.start,
    end: s.end,
    crop: cropRectFor(s.clip.width, s.clip.height, s.clip.framing),
    volume: clamp(project.edit.originalVolume, 0, 1),
    hasAudio: s.clip.hasAudio,
    zoom: zoomFor(i, project.edit.zoom),
  }));
  const narration = project.edit.narration && project.audioModes.includes('narracao')
    ? {
        uri: project.edit.narration.uri,
        volume: clamp(project.edit.narrationVolume, 0, 1),
        duration: Math.min(project.edit.narration.duration, tl.total),
      }
    : undefined;
  const music = project.edit.music ? { uri: project.edit.music.uri, volume: clamp(project.edit.music.volume, 0, 1) } : undefined;
  return { outputPath, ...OUTPUT, segments, narration, music };
}

/** Inverso de cropRectFor: posição do retângulo → deslocamento -1..1. */
export function framingFromCropCenter(cx: number, cy: number, crop: CropRect, zoom: number): Framing {
  const x = crop.width < 0.999 ? (2 * cx - 1) / (1 - crop.width) : 0;
  const y = crop.height < 0.999 ? (2 * cy - 1) / (1 - crop.height) : 0;
  return { x: clamp(x, -1, 1), y: clamp(y, -1, 1), zoom };
}
