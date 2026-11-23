// O "visual" das referências: legenda, cor, zoom e trilha só entram quando aparecem nos vídeos
// que o criador mostrou — e na mesma medida. Sem isso, o corte sai limpo. Nada de efeito por efeito.

import type { CaptionSettings, Project, StyleAnalysis } from './types';

export type ZoomMode = 'off' | 'suave' | 'punch';

export type RefLook = {
  captions: boolean | null;
  captionColor: string | null;
  captionPosition: 'baixo' | 'meio' | null;
  zoom: ZoomMode | null;
  music: boolean | null;
  /** Cores tiradas dos quadros das referências (ou dos clipes, na falta delas). */
  palette: string[];
};

export const EMPTY_LOOK: RefLook = { captions: null, captionColor: null, captionPosition: null, zoom: null, music: null, palette: [] };

/** Maioria simples entre as referências; empate ou nada medido = null. */
function vote(values: (boolean | null | undefined)[]): boolean | null {
  const known = values.filter((v): v is boolean => typeof v === 'boolean');
  if (!known.length) return null;
  const yes = known.filter(Boolean).length;
  if (yes * 2 === known.length) return null;
  return yes * 2 > known.length;
}

export type PerRefLook = {
  hasCaptions?: boolean | null;
  captionColor?: string | null;
  captionPosition?: 'baixo' | 'meio' | 'topo' | null;
  usesZoom?: boolean | null;
  zoomStyle?: 'suave' | 'punch' | null;
  usesMusic?: boolean | null;
};

export function combineLook(per: PerRefLook[], palette: string[]): RefLook {
  const captions = vote(per.map((p) => p.hasCaptions));
  const zoomOn = vote(per.map((p) => p.usesZoom));
  const punch = per.filter((p) => p.zoomStyle === 'punch').length;
  const soft = per.filter((p) => p.zoomStyle === 'suave').length;
  const colors = per.map((p) => p.captionColor).filter((c): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c));
  const pos = per.map((p) => p.captionPosition).filter(Boolean);
  return {
    captions,
    captionColor: colors[0]?.toUpperCase() ?? null,
    captionPosition: pos.length ? (pos.filter((x) => x === 'meio').length * 2 > pos.length ? 'meio' : 'baixo') : null,
    zoom: zoomOn === null ? null : zoomOn ? (punch > soft ? 'punch' : 'suave') : 'off',
    music: vote(per.map((p) => p.usesMusic)),
    palette,
  };
}

/** Zoom de um take: "suave" aproxima devagar (8%); "punch" alterna takes com corte mais perto. */
export function zoomFor(index: number, mode: ZoomMode | undefined): { from: number; to: number } | undefined {
  if (!mode || mode === 'off') return undefined;
  if (mode === 'suave') return { from: 1, to: 1.08 };
  return index % 2 === 1 ? { from: 1.15, to: 1.15 } : undefined;
}

/** Zoom num instante do take (para a prévia). */
export function zoomAt(z: { from: number; to: number } | undefined, progress: number): number {
  if (!z) return 1;
  const t = Math.max(0, Math.min(1, progress));
  return z.from + (z.to - z.from) * t;
}

/**
 * Ajustes iniciais do editor seguindo as referências. Só liga o que as referências mostram;
 * o que não foi medido fica desligado. Respeita o que o criador já mexeu.
 */
export function lookDefaults(p: Pick<Project, 'captions' | 'edit'>, look: RefLook): { captions: CaptionSettings; zoom: ZoomMode; musicSuggested: boolean } {
  const captions: CaptionSettings = {
    enabled: p.captions?.enabled ?? look.captions === true,
    style: p.captions?.style ?? 'contorno',
    position: p.captions?.position ?? look.captionPosition ?? 'baixo',
    color: p.captions?.color ?? look.captionColor ?? '#FFFFFF',
  };
  return { captions, zoom: p.edit.zoom ?? look.zoom ?? 'off', musicSuggested: look.music === true };
}

export function lookOf(analysis: StyleAnalysis | undefined): RefLook {
  return analysis?.look ?? EMPTY_LOOK;
}
