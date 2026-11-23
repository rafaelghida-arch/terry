// Fluxos do projeto: análise, roteiro, tomadas. Tudo passa pelo store, que salva no aparelho.
import { parseBrief, subjectFromBrief, titleFromBrief } from '../domain/brief';
import { generateHooksLocal, newId, regenerateSceneLocal } from '../domain/scriptLocal';
import {
  averageStructure,
  analysisIsCurrent,
  combineFeatures,
  effectiveFeatures,
  isDivergent,
  localAnalysis,
  terryLineFor,
} from '../domain/style';
import { buildTimeline, suggestTrim } from '../domain/timeline';
import { terry } from '../domain/terry';
import { effectiveGenre } from '../domain/genres';
import { combineLook, lookDefaults, lookOf } from '../domain/look';
import { DEFAULT_CAPTIONS, draftCaptions, newCue, toClipTime } from '../domain/captions';
import type { AudioMode, CaptionCue, CaptionSettings, Clip, Genre, StructureBeat, HookOption, Observation, Project, Scene, StyleAnalysis, TargetDuration } from '../domain/types';
import { getProject, putProject, updateProject } from '../state/store';
import { removeFile } from '../storage/projects';
import { AiUnavailableError, aiConfigured, analyzeReferencesAI, generateScriptAI, publishIdeaAI, regenerateSceneAI, type AiAnalysis } from './ai';
import { localPublishIdea, type PublishIdea } from '../domain/publish';
import { analyzeReference, paletteOf, transcribeClip, voiceOnsetOf } from './media';

export function createProject(input: { brief: string; genre: Genre; targetDuration: TargetDuration; audioModes: AudioMode[] }): Project {
  const now = Date.now();
  const p: Project = {
    id: newId('proj'),
    version: 1,
    title: projectTitle(input.brief, input.genre),
    createdAt: now,
    updatedAt: now,
    isDemo: false,
    stage: 'references',
    brief: input.brief.trim(),
    genre: input.genre,
    targetDuration: input.targetDuration,
    audioModes: input.audioModes,
    references: [],
    scriptApproved: false,
    scenes: [],
    clips: {},
    skippedSceneIds: [],
    edit: { originalVolume: 1, narrationVolume: 1 },
  };
  putProject(p);
  return p;
}

export const DEMO_BRIEF = 'Vou provar um xis de costela de R$ 38 em Porto Alegre. Quero mostrar o tamanho e contar se compraria de novo.';

/** Projeto de demonstração identificado: análise de exemplo, sem IA, pronto para gravar, montar e exportar. */
export function createDemoProject(): Project {
  const now = Date.now();
  const features = {
    opening: 'preparo' as const,
    foodBeforeSpeech: true,
    faceOnCamera: true,
    avgShot: 2.1,
    pace: 'medio' as const,
    ambientShare: 0.42,
    voiceOnset: 3.4,
    ending: 'veredito' as const,
    talkStyle: 'misto' as const,
  };
  const obs = (text: string): Observation => ({ id: newId('obs'), text, source: 'demo', enabled: true });
  const analysis: StyleAnalysis = {
    source: 'demo',
    createdAt: now,
    perReference: [],
    combined: features,
    observations: [
      obs('Exemplo: os dois vídeos abrem com o preparo e só o som da chapa.'),
      obs('Exemplo: a primeira fala entra depois de uns 3 segundos.'),
      obs('Exemplo: planos de uns 2 segundos, sem efeito entre eles.'),
      obs('Exemplo: termina com a opinião falada olhando pra câmera.'),
    ],
    divergent: false,
    terryLine: 'Nos dois vídeos, a comida aparece antes de alguém falar. Quer abrir o teu assim também?',
    referenceIds: [],
  };
  const p: Project = {
    id: newId('proj'),
    version: 1,
    title: 'Demonstração · Xis de costela',
    createdAt: now,
    updatedAt: now,
    isDemo: true,
    stage: 'hooks',
    brief: DEMO_BRIEF,
    genre: 'gastronomia',
    targetDuration: 30,
    audioModes: ['fala', 'ambiente'],
    references: [],
    analysis,
    analysisNote: 'Projeto de demonstração: a análise é um exemplo fixo, não veio de referências reais.',
    scriptApproved: false,
    scenes: [],
    clips: {},
    skippedSceneIds: [],
    edit: { originalVolume: 1, narrationVolume: 1 },
  };
  p.hooks = generateHooksLocal({ brief: p.brief, features, targetDuration: 30, audioModes: p.audioModes, genre: 'gastronomia' });
  putProject(p);
  return p;
}

function mergeAiAnalysis(local: StyleAnalysis, ai: AiAnalysis): StyleAnalysis {
  const perReference = local.perReference.map((pr) => {
    const a = ai.perReference.find((x) => x.referenceId === pr.referenceId);
    if (!a) return pr;
    return {
      referenceId: pr.referenceId,
      summary: a.summary,
      features: {
        ...pr.features, // medidas: ritmo, voz, ambiente
        opening: a.opening,
        foodBeforeSpeech: a.foodBeforeSpeech,
        faceOnCamera: a.faceOnCamera,
        ending: a.ending,
        talkStyle: a.talkStyle,
      },
    };
  });
  const feats = perReference.map((p) => p.features);
  const combined = combineFeatures(feats);
  const aiObs: Observation[] = ai.observations.map((o) => ({ id: newId('obs'), text: o.text, source: 'ia', enabled: true, referenceIds: o.referenceIds }));
  // Mantém as medidas de ritmo como observação "medida" e soma as da IA.
  const measured = local.observations.filter((o) => o.text.startsWith('Os planos duram'));
  // A fala do TERRY só vale se for verdadeira para todas — confere com as features.
  const ruleLine = terryLineFor(combined, feats);
  const structureByRef: Record<string, StructureBeat[]> = { ...(local.structureByRef ?? {}) };
  for (const r of ai.perReference) {
    if (r.structure?.length >= 2) structureByRef[r.referenceId] = r.structure.map((b) => ({ duration: b.duration, voice: b.voice, shot: b.shot, beat: b.beat, note: b.note }));
  }
  const look = combineLook(
    ai.perReference.map((r) => ({
      ...r,
      // trilha: a IA vê os quadros, mas quem ouve é a medição local
      usesMusic: r.usesMusic ?? local.look?.music ?? null,
    })),
    local.look?.palette ?? [],
  );
  return {
    look,
    structureByRef,
    // média das referências, sem pedir pro criador escolher uma
    structure: averageStructure(local.referenceIds.map((id) => structureByRef[id]).filter(Boolean)) ?? local.structure,
    source: 'ia',
    model: ai.model,
    createdAt: Date.now(),
    perReference,
    combined,
    observations: [...aiObs, ...measured],
    divergent: ai.divergent || isDivergent(feats),
    genre: ai.genre ? { detected: ai.genre, perReference: Object.fromEntries(ai.perReference.map((r) => [r.referenceId, r.genre])) } : undefined,
    terryLine: ruleLine ?? ai.terryLine,
    referenceIds: local.referenceIds,
  };
}

export type AnalysisProgress = (msg: string) => void;

/** Mede cada referência no aparelho e, se a IA estiver ligada, completa com a análise visual. */
export async function runAnalysis(projectId: string, onProgress: AnalysisProgress, force = false) {
  let p = getProject(projectId)!;
  if (!force && analysisIsCurrent(p.analysis, p.references)) return;

  const refs = [...p.references];
  for (let i = 0; i < refs.length; i++) {
    if (refs[i].metrics && refs[i].frames?.length) continue;
    onProgress(`Assistindo a referência ${i + 1} de ${refs.length}…`);
    refs[i] = await analyzeReference(projectId, refs[i]);
    const palette = await paletteOf(refs[i].uri);
    refs[i] = { ...refs[i], metrics: refs[i].metrics ? { ...refs[i].metrics!, palette } : undefined };
    updateProject(projectId, (cur) => ({ ...cur, references: cur.references.map((r) => (r.id === refs[i].id ? refs[i] : r)) }));
  }
  p = getProject(projectId)!;
  const local = localAnalysis(p.references);
  let analysis = local;
  let note: string | undefined;

  if (aiConfigured()) {
    onProgress('Olhando como elas abrem, quando aparece rosto e comida…');
    try {
      const ai = await analyzeReferencesAI(p.brief, p.genre ?? 'gastronomia', p.references);
      analysis = mergeAiAnalysis(local, ai);
    } catch (e) {
      note = e instanceof AiUnavailableError && e.reason === 'sem_chave' ? terry.analysisUnavailable('sem_servidor') : terry.analysisUnavailable('falha');
    }
  } else {
    note = terry.analysisUnavailable('sem_servidor');
  }

  updateProject(projectId, (cur) => ({
    ...cur,
    analysis,
    analysisNote: note,
    primaryReferenceId: analysis.divergent ? cur.primaryReferenceId : undefined,
    stage: 'style',
  }));
}

export function editObservation(projectId: string, obsId: string, patch: Partial<Observation>) {
  updateProject(projectId, (p) =>
    p.analysis
      ? {
          ...p,
          analysis: {
            ...p.analysis,
            observations: p.analysis.observations.map((o) =>
              o.id === obsId ? { ...o, ...patch, source: patch.text !== undefined && patch.text !== o.text ? 'criador' : o.source } : o,
            ),
          },
        }
      : p,
  );
}

export function addObservation(projectId: string, text: string) {
  updateProject(projectId, (p) =>
    p.analysis
      ? { ...p, analysis: { ...p.analysis, observations: [...p.analysis.observations, { id: newId('obs'), text, source: 'criador', enabled: true }] } }
      : p,
  );
}

function scriptContext(p: Project) {
  const features = p.analysis!.combined; // média das referências
  const primary = p.primaryReferenceId ? p.references.find((r) => r.id === p.primaryReferenceId) : undefined;
  const primarySummary = primary ? p.analysis!.perReference.find((r) => r.referenceId === primary.id)?.summary : undefined;
  return {
    brief: p.brief,
    genre: effectiveGenre(p.genre, p.analysis?.genre?.detected),
    targetDuration: p.targetDuration,
    audioModes: p.audioModes,
    features,
    observations: p.analysis!.observations.filter((o) => o.enabled).map((o) => o.text),
    primaryReference: primary ? `${primary.name}: ${primarySummary ?? ''}` : null,
    structure: p.analysis!.structure,
  };
}

const withIds = (scenes: Omit<Scene, 'id'>[] | Scene[]): Scene[] =>
  scenes.map((s) => ({
    ...s,
    id: newId('cena'),
    line: (s as Scene).line ?? undefined,
    tip: (s as Scene).tip ?? undefined,
    duration: Math.max(1, Math.round(s.duration * 2) / 2),
  }));

export async function generateScript(projectId: string): Promise<{ usedAi: boolean; note?: string }> {
  const p = getProject(projectId)!;
  const ctx = scriptContext(p);
  let hooks: HookOption[] | null = null;
  let note: string | undefined;
  if (p.analysis?.source === 'ia' && aiConfigured()) {
    try {
      const res = await generateScriptAI(ctx);
      hooks = res.hooks.map((h) => ({
        id: newId('gancho'),
        title: h.title,
        approach: h.approach,
        why: h.why,
        scenes: withIds(
          h.scenes.map((s) => ({ ...s, line: s.line ?? undefined, tip: s.tip ?? undefined, ...(s.role === 'mordida' || s.role === 'reacao' ? { line: undefined } : {}) })),
        ),
      }));
    } catch {
      note = 'Não consegui gerar o roteiro com a IA agora. Montei um roteiro base com o que medi.';
    }
  }
  if (!hooks) hooks = generateHooksLocal(ctx);
  updateProject(projectId, (cur) => ({ ...cur, hooks, chosenHookId: undefined, stage: 'hooks' }));
  return { usedAi: !note && p.analysis?.source === 'ia', note };
}

export function chooseHook(projectId: string, hookId: string) {
  updateProject(projectId, (p) => {
    const hook = p.hooks?.find((h) => h.id === hookId);
    if (!hook) return p;
    // Clipes já gravados continuam associados às cenas com a mesma função.
    const used = new Set<string>();
    const scenes = hook.scenes.map((s) => {
      const prev = p.scenes.find((o) => o.role === s.role && o.clipId && !used.has(o.clipId));
      if (prev?.clipId) used.add(prev.clipId);
      return { ...s, id: newId('cena'), clipId: prev?.clipId };
    });
    return { ...p, chosenHookId: hookId, scenes, scriptApproved: false, selectedSceneId: scenes[0]?.id };
  });
}

export function approveScript(projectId: string) {
  updateProject(projectId, (p) => ({ ...p, scriptApproved: true, stage: 'shoot' }));
}

export function updateScene(projectId: string, sceneId: string, patch: Partial<Scene>) {
  updateProject(projectId, (p) => ({ ...p, scenes: p.scenes.map((s) => (s.id === sceneId ? { ...s, ...patch } : s)) }));
}

export function moveScene(projectId: string, sceneId: string, dir: -1 | 1) {
  updateProject(projectId, (p) => {
    const i = p.scenes.findIndex((s) => s.id === sceneId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.scenes.length) return p;
    const scenes = [...p.scenes];
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    return { ...p, scenes };
  });
}

export function deleteScene(projectId: string, sceneId: string) {
  updateProject(projectId, (p) => {
    const scene = p.scenes.find((s) => s.id === sceneId);
    const clips = { ...p.clips };
    if (scene?.clipId) {
      removeFile(clips[scene.clipId]?.uri);
      removeFile(clips[scene.clipId]?.thumbUri);
      delete clips[scene.clipId];
    }
    return { ...p, scenes: p.scenes.filter((s) => s.id !== sceneId), clips, skippedSceneIds: p.skippedSceneIds.filter((id) => id !== sceneId) };
  });
}

export function addScene(projectId: string, afterId?: string): string {
  const id = newId('cena');
  updateProject(projectId, (p) => {
    const s: Scene = { id, role: 'detalhe', title: 'Nova tomada', instruction: 'O que filmar aqui?', duration: 3, audio: 'Som ambiente.' };
    const i = afterId ? p.scenes.findIndex((x) => x.id === afterId) + 1 : p.scenes.length;
    const scenes = [...p.scenes];
    scenes.splice(i, 0, s);
    return { ...p, scenes, selectedSceneId: id };
  });
  return id;
}

const regenCount: Record<string, number> = {};

/** Nova versão de uma cena. As outras cenas e os clipes ficam como estão. */
export async function regenerateScene(projectId: string, sceneId: string): Promise<void> {
  const p = getProject(projectId)!;
  const index = p.scenes.findIndex((s) => s.id === sceneId);
  if (index < 0) return;
  const current = p.scenes[index];
  const ctx = scriptContext(p);
  let next: Scene | null = null;
  if (p.analysis?.source === 'ia' && aiConfigured()) {
    try {
      const { scene } = await regenerateSceneAI(ctx, p.scenes, index);
      next = {
        ...scene,
        id: current.id,
        clipId: current.clipId,
        line: scene.role === 'mordida' || scene.role === 'reacao' ? undefined : scene.line ?? undefined,
        tip: scene.tip ?? undefined,
      };
    } catch {
      next = null;
    }
  }
  if (!next) {
    regenCount[sceneId] = (regenCount[sceneId] ?? 0) + 1;
    next = regenerateSceneLocal(current, ctx, regenCount[sceneId]);
  }
  updateScene(projectId, sceneId, next);
}

/** Liga um clipe a uma cena (substituindo o anterior) e sugere um trecho se for longo. */
export async function assignClip(projectId: string, sceneId: string, clip: Clip): Promise<string | null> {
  const p = getProject(projectId)!;
  const scene = p.scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  let onset: number | null = null;
  if (clip.hasAudio && scene.line && p.audioModes.includes('fala') && clip.duration > scene.duration * 1.5) {
    onset = await voiceOnsetOf(projectId, clip.uri);
  }
  const trim = suggestTrim(clip.duration, scene, onset);
  const finalClip: Clip = { ...clip, trimStart: trim.start, trimEnd: trim.end };
  // Vídeo horizontal: começa centralizado; o criador ajusta em "Enquadrar".
  updateProject(projectId, (cur) => {
    const old = cur.scenes.find((s) => s.id === sceneId)?.clipId;
    const clips = { ...cur.clips, [finalClip.id]: finalClip };
    if (old && old !== finalClip.id) {
      removeFile(clips[old]?.uri);
      removeFile(clips[old]?.thumbUri);
      delete clips[old];
    }
    const coverUri = cur.coverUri ?? finalClip.thumbUri;
    return {
      ...cur,
      clips,
      coverUri: cur.scenes[0]?.id === sceneId ? finalClip.thumbUri ?? coverUri : coverUri,
      scenes: cur.scenes.map((s) => (s.id === sceneId ? { ...s, clipId: finalClip.id } : s)),
      skippedSceneIds: cur.skippedSceneIds.filter((id) => id !== sceneId),
    };
  });
  return terry.clipAdded(clip.duration, scene, trim);
}

export function updateClip(projectId: string, clipId: string, patch: Partial<Clip>) {
  updateProject(projectId, (p) => (p.clips[clipId] ? { ...p, clips: { ...p.clips, [clipId]: { ...p.clips[clipId], ...patch } } } : p));
}

export function toggleSkip(projectId: string, sceneId: string, skip: boolean) {
  updateProject(projectId, (p) => ({
    ...p,
    skippedSceneIds: skip ? [...new Set([...p.skippedSceneIds, sceneId])] : p.skippedSceneIds.filter((id) => id !== sceneId),
  }));
}

export function briefFacts(p: Project) {
  return parseBrief(p.brief);
}

/** Troca o tipo de conteúdo. O roteiro já escolhido fica; as opções de gancho são refeitas. */
export function setGenre(projectId: string, genre: Genre) {
  updateProject(projectId, (p) => ({ ...p, genre }));
}

// ---------------------------------------------------------------------------
// Legendas

export type CaptionReport = { transcribed: number; fromScript: number; empty: string[]; unavailable?: string };

/**
 * Liga as legendas e legenda TODOS os takes do mesmo jeito: transcreve a fala de cada um no
 * aparelho; onde não der, usa a fala do roteiro; o que sobrar fica listado para o criador escrever.
 * `force` refaz também os takes que já tinham legenda.
 */
export async function enableCaptions(projectId: string, force = false, onProgress?: (msg: string) => void): Promise<CaptionReport> {
  const p = getProject(projectId)!;
  const tl = buildTimeline(p);
  const report: CaptionReport = { transcribed: 0, fromScript: 0, empty: [] };
  const result: Record<string, CaptionCue[]> = {};
  for (const [i, seg] of tl.segments.entries()) {
    const clip = seg.clip;
    const scene = p.scenes[seg.sceneIndex];
    if (!force && clip.captions?.length) continue;
    onProgress?.(`Ouvindo o take ${i + 1} de ${tl.segments.length}…`);
    let cues: CaptionCue[] = [];
    if (clip.hasAudio) {
      const t = await transcribeClip(projectId, clip);
      if (t.ok) cues = t.cues;
      else report.unavailable = t.reason;
      if (cues.length) report.transcribed++;
    }
    if (!cues.length && scene?.line) {
      const onset = clip.hasAudio ? await voiceOnsetOf(projectId, clip.uri) : null;
      cues = draftCaptions(clip, scene, onset);
      if (cues.length) report.fromScript++;
    }
    if (!cues.length) report.empty.push(scene?.title ?? `Take ${i + 1}`);
    result[clip.id] = cues;
  }
  const look = lookOf(p.analysis);
  updateProject(projectId, (cur) => ({
    ...cur,
    clips: Object.fromEntries(Object.entries(cur.clips).map(([id, c]) => [id, result[id] ? { ...c, captions: result[id] } : c])),
    captions: { ...DEFAULT_CAPTIONS, color: look.captionColor ?? '#FFFFFF', ...cur.captions, enabled: true },
  }));
  return report;
}

/** Na primeira montagem, o editor começa com o visual das referências (e só com ele). */
export function applyReferenceLook(projectId: string): { captionsOn: boolean } {
  const p = getProject(projectId)!;
  if (p.edit.lookApplied) return { captionsOn: false };
  const look = lookOf(p.analysis);
  const d = lookDefaults(p, look);
  updateProject(projectId, (cur) => ({
    ...cur,
    captions: d.captions,
    edit: {
      ...cur.edit,
      lookApplied: true,
      zoom: d.zoom,
      // Trilha nunca entra sozinha: o vídeo sai com o som real; a sugestão de trilha vem na exportação.
    },
  }));
  return { captionsOn: d.captions.enabled };
}

export function updateCaptionSettings(projectId: string, patch: Partial<CaptionSettings>) {
  updateProject(projectId, (p) => ({ ...p, captions: { ...DEFAULT_CAPTIONS, ...p.captions, ...patch } }));
}

export function updateCue(projectId: string, clipId: string, cueId: string, patch: Partial<CaptionCue>) {
  updateProject(projectId, (p) => {
    const c = p.clips[clipId];
    if (!c) return p;
    return { ...p, clips: { ...p.clips, [clipId]: { ...c, captions: (c.captions ?? []).map((q) => (q.id === cueId ? { ...q, ...patch } : q)) } } };
  });
}

export function deleteCue(projectId: string, clipId: string, cueId: string) {
  updateProject(projectId, (p) => {
    const c = p.clips[clipId];
    if (!c) return p;
    return { ...p, clips: { ...p.clips, [clipId]: { ...c, captions: (c.captions ?? []).filter((q) => q.id !== cueId) } } };
  });
}

/** Nova legenda no instante atual da prévia (2 s, sem passar do fim do trecho). */
export function addCueAt(projectId: string, t: number): string | null {
  const p = getProject(projectId)!;
  const at = toClipTime(p, t);
  if (!at) return null;
  const cue = newCue(at.time, Math.min(at.segEnd, at.time + 2), '');
  updateProject(projectId, (cur) => {
    const c = cur.clips[at.clipId];
    const captions = [...(c.captions ?? []), cue].sort((a, b) => a.start - b.start);
    return { ...cur, clips: { ...cur.clips, [at.clipId]: { ...c, captions } } };
  });
  return cue.id;
}

// ---------------------------------------------------------------------------
// Publicação: hashtags, título, descrição e recomendação de trilha

export async function publishIdea(projectId: string): Promise<PublishIdea> {
  const p = getProject(projectId)!;
  if (p.publish?.sound) return p.publish;
  const genre = effectiveGenre(p.genre, p.analysis?.genre?.detected);
  let idea: PublishIdea = localPublishIdea({ brief: p.brief, title: p.title, genre });
  if (p.analysis?.source === 'ia' && aiConfigured()) {
    try {
      const r = await publishIdeaAI({
        brief: p.brief,
        genre,
        title: p.title,
        observations: p.analysis.observations.filter((o) => o.enabled).map((o) => o.text),
        references: p.analysis.perReference.map((r) => r.summary),
      });
      if (r.hashtags.length) idea = { ...r, source: 'ia' };
    } catch {
      // segue com a sugestão local
    }
  }
  updateProject(projectId, (cur) => ({ ...cur, publish: idea }));
  return idea;
}

/** Título do projeto: em comida, prato e lugar; nos outros tipos, o assunto do briefing. */
export function projectTitle(brief: string, genre: Genre): string {
  if (genre === 'gastronomia') return titleFromBrief(brief);
  const subject = subjectFromBrief(brief, '');
  if (!subject) return titleFromBrief(brief);
  const t = subject.charAt(0).toUpperCase() + subject.slice(1);
  const place = parseBrief(brief).place;
  return place && !t.includes(place) ? `${t} · ${place}` : t;
}
