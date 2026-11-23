// Estado em memória + gravação no aparelho. Salva logo após cada mudança (com
// pequeno atraso) e imediatamente quando o app vai para o fundo ou a tela bloqueia.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { Project } from '../domain/types';
import { deleteProject, listProjects, saveProjectSync } from '../storage/projects';

let projects: Record<string, Project> = {};
let loaded = false;
let version = 0;
const listeners = new Set<() => void>();
const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  version++;
  listeners.forEach((l) => l());
}

export function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  try {
    for (const p of listProjects()) projects[p.id] = p;
  } catch (e) {
    console.warn('Não consegui ler os rascunhos salvos', e);
  }
}

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  for (const id of dirty) {
    const p = projects[id];
    if (p) {
      try {
        saveProjectSync(p);
      } catch (e) {
        console.warn('Falha ao salvar projeto', id, e);
      }
    }
  }
  dirty.clear();
}

function schedule(id: string) {
  dirty.add(id);
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

AppState.addEventListener('change', (s) => {
  if (s !== 'active') flush();
});

export function getProject(id: string): Project | undefined {
  ensureLoaded();
  return projects[id];
}

export function putProject(p: Project) {
  projects = { ...projects, [p.id]: { ...p, updatedAt: Date.now() } };
  schedule(p.id);
  emit();
}

export function updateProject(id: string, fn: (p: Project) => Project) {
  const cur = getProject(id);
  if (!cur) return;
  putProject(fn(cur));
}

export function removeProject(id: string) {
  const { [id]: _, ...rest } = projects;
  projects = rest;
  dirty.delete(id);
  deleteProject(id);
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useProjects(): Project[] {
  ensureLoaded();
  useSyncExternalStore(subscribe, () => version);
  return Object.values(projects).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function useProject(id: string | undefined): Project | undefined {
  ensureLoaded();
  useSyncExternalStore(subscribe, () => (id ? projects[id] : undefined));
  return id ? projects[id] : undefined;
}
