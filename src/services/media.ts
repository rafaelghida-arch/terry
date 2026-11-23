// Ponte entre o app e o módulo nativo TerryMedia + utilidades de mídia do Expo.
import * as VideoThumbnails from 'expo-video-thumbnails';
import { Directory, File } from 'expo-file-system';
import TerryMedia from '../../modules/terry-media';
import type { CaptionCue, Clip, MediaInfo, Project, Reference } from '../domain/types';
import { cuesFromText, cuesFromWords, timelineCaptions, voicedSpans } from '../domain/captions';
import { captionPalette } from '../domain/palette';
import { classifyAudio, metricsFromRaw, cutsFromDiffs, type RawAnalysis } from '../domain/style';
import { buildExportSpec, clipRange, DEFAULT_FRAMING } from '../domain/timeline';
import { importFile, mediaDir } from '../storage/projects';
import { newId } from '../domain/scriptLocal';
import { resolveMusicUri } from './tracks';

const extOf = (uri: string) => (/\.(mov|qt)(\?|$)/i.test(uri) ? 'mov' : /\.m4v(\?|$)/i.test(uri) ? 'm4v' : 'mp4');

/** Guarda a narração na pasta do projeto (o cache do sistema pode ser limpo). */
export async function keepNarration(projectId: string, uri: string): Promise<string> {
  const ext = /\.(\w+)(\?|$)/.exec(uri)?.[1] ?? 'm4a';
  return importFile(uri, mediaDir(projectId, 'audio'), `${newId('narracao')}.${ext}`);
}

export const isSimulator = false;
export const nativeMediaAvailable = () => TerryMedia != null;

export class NativeMissingError extends Error {
  constructor() {
    super('Este recurso precisa do development build do TERRY (não funciona no Expo Go).');
  }
}

function native() {
  if (!TerryMedia) throw new NativeMissingError();
  return TerryMedia;
}

export async function getInfo(uri: string): Promise<MediaInfo> {
  const i = await native().getVideoInfo(uri);
  return { duration: i.duration, width: i.width, height: i.height, hasAudio: i.hasAudio };
}

export async function makeThumb(projectId: string, uri: string, timeSec = 0.3): Promise<string | undefined> {
  try {
    const r = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.round(timeSec * 1000), quality: 0.6 });
    return await importFile(r.uri, mediaDir(projectId, 'thumbs'), `${newId('th')}.jpg`);
  } catch {
    return undefined;
  }
}

/** Miniaturas ao longo do clipe para a faixa de aparar. */
export async function filmstrip(uri: string, duration: number, count: number): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    try {
      const t = ((i + 0.5) / count) * duration;
      const r = await VideoThumbnails.getThumbnailAsync(uri, { time: Math.round(t * 1000), quality: 0.3 });
      out.push(r.uri);
    } catch {
      out.push('');
    }
  }
  return out;
}

/** Importa um vídeo de referência para a pasta do projeto, com miniatura e duração. */
export async function importReference(projectId: string, uri: string, name: string): Promise<Reference> {
  const id = newId('ref');
  const local = await importFile(uri, mediaDir(projectId, 'refs'), `${id}.${extOf(uri)}`);
  const info = await getInfo(local);
  const thumbUri = await makeThumb(projectId, local, Math.min(0.5, info.duration / 3));
  return { id, uri: local, name, thumbUri, duration: info.duration, width: info.width, height: info.height };
}

/** Mede cortes, áudio e extrai quadros-chave de uma referência. Tudo no aparelho. */
export async function analyzeReference(projectId: string, ref: Reference): Promise<Reference> {
  const outDir = mediaDir(projectId, 'frames');
  const raw = await native().analyzeVideo(ref.uri, {
    sampleFps: 4,
    frameCount: 8,
    frameMaxSize: 512,
    outputDir: new Directory(outDir, ref.id).uri,
    audioWindow: 0.1,
  });
  const analysis: RawAnalysis = {
    duration: raw.duration,
    width: raw.width,
    height: raw.height,
    hasAudio: raw.hasAudio,
    cuts: cutsFromDiffs(raw.diffs, raw.diffInterval),
    rmsDb: raw.rmsDb,
    zcr: raw.zcr,
    audioWindow: raw.audioWindow,
    frames: raw.frames,
  };
  return { ...ref, metrics: metricsFromRaw(analysis), frames: raw.frames };
}

/** Mede só o áudio de um clipe (para sugerir onde a fala começa). */
export async function voiceOnsetOf(projectId: string, uri: string): Promise<number | null> {
  try {
    const raw = await native().analyzeVideo(uri, {
      sampleFps: 1,
      frameCount: 1,
      frameMaxSize: 64,
      outputDir: new Directory(mediaDir(projectId, 'frames'), 'tmp').uri,
      audioWindow: 0.1,
    });
    const m = metricsFromRaw({ ...raw, cuts: [], frames: [] });
    return m.voiceOnset;
  } catch {
    return null;
  }
}

/** Copia o clipe para o projeto e cria o registro com miniatura. Original fica intacto. */
export async function createClip(projectId: string, uri: string, origin: Clip['origin']): Promise<Clip> {
  const id = newId('clip');
  const local = await importFile(uri, mediaDir(projectId, 'clips'), `${id}.${extOf(uri)}`);
  const info = await getInfo(local);
  const thumbUri = await makeThumb(projectId, local, Math.min(0.5, info.duration / 2));
  return {
    id,
    uri: local,
    thumbUri,
    origin,
    duration: info.duration,
    width: info.width,
    height: info.height,
    hasAudio: info.hasAudio,
    trimStart: 0,
    trimEnd: info.duration,
    framing: { ...DEFAULT_FRAMING },
    createdAt: Date.now(),
  };
}

export function onExportProgress(cb: (p: number) => void) {
  if (!TerryMedia) return { remove() {} };
  return TerryMedia.addListener('onExportProgress', (e) => cb(e.progress));
}

export async function exportProject(project: Project): Promise<{ uri: string; duration: number }> {
  const out = new File(mediaDir(project.id, 'exports'), `terry_${Date.now()}.mp4`).uri;
  const spec = buildExportSpec(project, out);
  if (project.captions?.enabled) {
    const cues = timelineCaptions(project).map(({ start, end, text }) => ({ start, end, text }));
    if (cues.length) spec.captions = { cues, style: project.captions.style, position: project.captions.position, color: project.captions.color ?? '#FFFFFF' };
  }
  if (!spec.segments.length) throw new Error('Nenhum clipe gravado ainda.');
  if (spec.music) {
    const uri = await resolveMusicUri(project.edit.music);
    spec.music = uri ? { ...spec.music, uri } : undefined;
  }
  return native().exportComposition(spec);
}

export function cancelExport() {
  TerryMedia?.cancelExport();
}

/** Até 3 cores do vídeo (para a legenda). */
export async function paletteOf(uri: string): Promise<string[]> {
  try {
    const r = await native().framePixels(uri, 6, 24);
    return captionPalette(r.pixels);
  } catch {
    return [];
  }
}

export type Transcription = { cues: CaptionCue[]; ok: boolean; reason?: string };

/**
 * Transcreve a fala de um clipe no próprio aparelho e devolve legendas no tempo do arquivo.
 * iOS traz o tempo de cada palavra; Android traz o texto e o TERRY encaixa nos trechos com voz.
 */
export async function transcribeClip(projectId: string, clip: Clip): Promise<Transcription> {
  const range = clipRange(clip);
  try {
    const r = await native().transcribe(clip.uri, 'pt-BR');
    if (!r.available) return { cues: [], ok: false, reason: r.reason };
    if (r.timed) return { cues: cuesFromWords(r.words, range), ok: true };
    if (!r.text.trim()) return { cues: [], ok: true };
    const raw = await native().analyzeVideo(clip.uri, {
      sampleFps: 1,
      frameCount: 1,
      frameMaxSize: 64,
      outputDir: new Directory(mediaDir(projectId, 'frames'), 'stt').uri,
      audioWindow: 0.1,
    });
    const { labels } = classifyAudio(raw.rmsDb, raw.zcr, raw.audioWindow);
    return { cues: cuesFromText(r.text, voicedSpans(labels, raw.audioWindow), range), ok: true };
  } catch (e) {
    return { cues: [], ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
