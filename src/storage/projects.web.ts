// Versão do simulador (navegador): rascunhos no localStorage; a mídia fica em URLs do navegador.
import type { Project } from '../domain/types';

const KEY = 'terry:projects';

type Dir = { uri: string };

function readAll(): Record<string, Project> {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, Project>) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {
    // armazenamento cheio ou bloqueado: o simulador segue só na memória
  }
}

export function projectDir(id: string): Dir {
  return { uri: `memory://${id}/` };
}

export function mediaDir(id: string, sub: string): Dir {
  return { uri: `memory://${id}/${sub}/` };
}

export function saveProjectSync(p: Project) {
  const all = readAll();
  all[p.id] = p;
  writeAll(all);
}

export function loadProject(id: string): Project | null {
  return readAll()[id] ?? null;
}

export function listProjects(): Project[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteProject(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

export async function importFile(uri: string, _dest: Dir, _name: string): Promise<string> {
  return uri;
}

export function removeFile(_uri?: string) {}
