// Fluxos do projeto: análise, roteiro, tomadas. Tudo passa pelo store, que salva no aparelho.
import { parseBrief, titleFromBrief } from '../domain/brief';
import { generateHooksLocal, newId, regenerateSceneLocal } from '../domain/scriptLocal';
import {
  analysisIsCurrent,
  combineFeatures,
  effectiveFeatures,
  isDivergent,
  localAnalysis,
  terryLineFor,
} from '../domain/style';
import { suggestTrim } from '../domain/timeline';
import { terry } from '../domain/terry';
import type { AudioMode, Clip, HookOption, Observation, Project, Scene, StyleAnalysis, TargetDuration } from '../domain/types';
import { getProject, putProject, updateProject } from '../state/store';
import { removeFile } from '../storage/projects';
import { AiUnavailableError, aiConfigured, analyzeReferencesAI, generateScriptAI, regenerateSceneAI, type AiAnalysis } from './ai';
import { analyzeReference, voiceOnsetOf } from './media';

export function createProject(input: { brief: string; targetDuration: TargetDuration; audioModes: AudioMode[] }): Project {
  const now = Date.now();
  const p: Project = {
    id: newId('proj'),
    version: 1,
    title: titleFromBrief(input.brief),
    createdAt: now,
    updatedAt: now,
    isDemo: false,
    stage: 'references',
    brief: input.brief.trim(),
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
  p.hooks = generateHooksLocal({ brief: p.brief, features, targetDuration: 30, audioModes: p.audioModes });
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
  return {
    source: 'ia',
    model: ai.model,
    createdAt: Date.now(),
    perReference,
    combined,
    observations: [...aiObs, ...measured],
    divergent: ai.divergent || isDivergent(feats),
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
    updateProject(projectId, (cur) => ({ ...cur, references: cur.references.map((r) => (r.id === refs[i].id ? refs[i] : r)) }));
  }
  p = getProject(projectId)!;
  const local = localAnalysis(p.references);
  let analysis = local;
  let note: string | undefined;

  if (aiConfigured()) {
    onProgress('Olhando como elas abrem, quando aparece rosto e comida…');
    try {
      const ai = await analyzeReferencesAI(p.brief, p.references);
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
  const features = effectiveFeatures(p.analysis!, p.primaryReferenceId);
  const primary = p.primaryReferenceId ? p.references.find((r) => r.id === p.primaryReferenceId) : undefined;
  const primarySummary = primary ? p.analysis!.perReference.find((r) => r.referenceId === primary.id)?.summary : undefined;
  return {
    brief: p.brief,
    targetDuration: p.targetDuration,
    audioModes: p.audioModes,
    features,
    observations: p.analysis!.observations.filter((o) => o.enabled).map((o) => o.text),
    primaryReference: primary ? `${primary.name}: ${primarySummary ?? ''}` : null,
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
