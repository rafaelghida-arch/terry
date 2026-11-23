// Mídia no simulador (navegador). Mesma interface de media.ts, usando <video>, <canvas> e Web Audio.
// A exportação MP4 é nativa e só existe no app do celular.
import type { Clip, MediaInfo, Project, Reference } from '../domain/types';
import { cutsFromDiffs, metricsFromRaw, type RawAnalysis } from '../domain/style';
import { DEFAULT_FRAMING } from '../domain/timeline';
import { newId } from '../domain/scriptLocal';

/* eslint-disable @typescript-eslint/no-explicit-any */
const doc: any = (globalThis as any).document;

export const isSimulator = true;
export const nativeMediaAvailable = () => true;

export class NativeMissingError extends Error {
  constructor() {
    super('No simulador isso não roda. Instale o app no celular para usar.');
  }
}

export class SimulatorExportError extends Error {
  constructor() {
    super('A exportação do MP4 roda no app do celular. No simulador dá para montar e assistir a prévia.');
  }
}

function loadVideo(uri: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const v = doc.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.onloadeddata = () => resolve(v);
    v.onerror = () => reject(new Error('O navegador não conseguiu abrir esse vídeo.'));
    v.src = uri;
  });
}

function seek(v: any, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      v.removeEventListener('seeked', done);
      resolve();
    };
    v.addEventListener('seeked', done);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
    setTimeout(done, 1500);
  });
}

function snapshot(v: any, maxSide: number, quality = 0.7): string {
  const scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
  const c = doc.createElement('canvas');
  c.width = Math.max(1, Math.round(v.videoWidth * scale));
  c.height = Math.max(1, Math.round(v.videoHeight * scale));
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function pixels(v: any): Uint8ClampedArray {
  const c = doc.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(v, 0, 0, 16, 16);
  return ctx.getImageData(0, 0, 16, 16).data;
}

function diff(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return sum / ((a.length / 4) * 3) / 255;
}

async function audioEnvelope(uri: string, win: number): Promise<{ rms: number[]; zcr: number[]; hasAudio: boolean }> {
  try {
    const buf = await (await fetch(uri)).arrayBuffer();
    const Ctx = (globalThis as any).AudioContext ?? (globalThis as any).webkitAudioContext;
    const ctx = new Ctx();
    const audio = await ctx.decodeAudioData(buf);
    ctx.close?.();
    const data: Float32Array = audio.getChannelData(0);
    const size = Math.max(1, Math.round(audio.sampleRate * win));
    const zcrScale = audio.sampleRate / 16000; // as regras foram calibradas a 16 kHz
    const rms: number[] = [];
    const zcr: number[] = [];
    for (let i = 0; i + size <= data.length; i += size) {
      let acc = 0;
      let cross = 0;
      for (let j = i; j < i + size; j++) {
        acc += data[j] * data[j];
        if (j > i && data[j] >= 0 !== data[j - 1] >= 0) cross++;
      }
      rms.push(Math.max(-90, 20 * Math.log10(Math.max(Math.sqrt(acc / size), 1e-9))));
      zcr.push((cross / size) * zcrScale);
    }
    return { rms, zcr, hasAudio: true };
  } catch {
    return { rms: [], zcr: [], hasAudio: false };
  }
}

export async function getInfo(uri: string): Promise<MediaInfo> {
  const v = await loadVideo(uri);
  return { duration: v.duration, width: v.videoWidth, height: v.videoHeight, hasAudio: true };
}

export async function makeThumb(_projectId: string, uri: string, timeSec = 0.3): Promise<string | undefined> {
  try {
    const v = await loadVideo(uri);
    await seek(v, timeSec);
    return snapshot(v, 360);
  } catch {
    return undefined;
  }
}

export async function filmstrip(uri: string, duration: number, count: number): Promise<string[]> {
  try {
    const v = await loadVideo(uri);
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      await seek(v, ((i + 0.5) / count) * duration);
      out.push(snapshot(v, 120, 0.5));
    }
    return out;
  } catch {
    return [];
  }
}

export async function keepNarration(_projectId: string, uri: string): Promise<string> {
  return uri;
}

export async function importReference(projectId: string, uri: string, name: string): Promise<Reference> {
  const info = await getInfo(uri);
  const thumbUri = await makeThumb(projectId, uri, Math.min(0.5, info.duration / 3));
  return { id: newId('ref'), uri, name, thumbUri, duration: info.duration, width: info.width, height: info.height };
}

export async function analyzeReference(_projectId: string, ref: Reference): Promise<Reference> {
  const v = await loadVideo(ref.uri);
  const duration = v.duration;
  const interval = Math.max(0.5, duration / 120);
  const diffs: number[] = [];
  let prev: Uint8ClampedArray | null = null;
  for (let t = 0; t < duration; t += interval) {
    await seek(v, t);
    const px = pixels(v);
    if (prev) diffs.push(diff(prev, px));
    prev = px;
  }
  const frames: { t: number; uri: string }[] = [];
  const times = [Math.min(0.3, duration / 4), ...Array.from({ length: 7 }, (_, i) => (duration * (i + 1.5)) / 8)];
  for (const t of times) {
    await seek(v, t);
    frames.push({ t, uri: snapshot(v, 512) });
  }
  const audio = await audioEnvelope(ref.uri, 0.1);
  const raw: RawAnalysis = {
    duration,
    width: v.videoWidth,
    height: v.videoHeight,
    hasAudio: audio.hasAudio,
    cuts: cutsFromDiffs(diffs, interval),
    rmsDb: audio.rms,
    zcr: audio.zcr,
    audioWindow: 0.1,
    frames,
  };
  return { ...ref, metrics: metricsFromRaw(raw), frames };
}

export async function voiceOnsetOf(_projectId: string, uri: string): Promise<number | null> {
  const a = await audioEnvelope(uri, 0.1);
  if (!a.hasAudio) return null;
  return metricsFromRaw({ duration: a.rms.length * 0.1, width: 0, height: 0, hasAudio: true, cuts: [], rmsDb: a.rms, zcr: a.zcr, audioWindow: 0.1, frames: [] }).voiceOnset;
}

export async function createClip(projectId: string, uri: string, origin: Clip['origin']): Promise<Clip> {
  const info = await getInfo(uri);
  const thumbUri = await makeThumb(projectId, uri, Math.min(0.5, info.duration / 2));
  const audio = await audioEnvelope(uri, 0.5);
  return {
    id: newId('clip'),
    uri,
    thumbUri,
    origin,
    duration: info.duration,
    width: info.width,
    height: info.height,
    hasAudio: audio.hasAudio,
    trimStart: 0,
    trimEnd: info.duration,
    framing: { ...DEFAULT_FRAMING },
    createdAt: Date.now(),
  };
}

export function onExportProgress(_cb: (p: number) => void) {
  return { remove() {} };
}

export async function exportProject(_project: Project): Promise<{ uri: string; duration: number }> {
  throw new SimulatorExportError();
}

export function cancelExport() {}
