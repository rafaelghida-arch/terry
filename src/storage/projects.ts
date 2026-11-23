// Rascunhos ficam no aparelho: um JSON por projeto + os arquivos de mídia na pasta dele.
import { Directory, File, Paths } from 'expo-file-system';
import type { Project } from '../domain/types';

const root = () => {
  const d = new Directory(Paths.document, 'terry');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};

export function projectDir(id: string): Directory {
  const d = new Directory(root(), 'projects', id);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function mediaDir(id: string, sub: 'clips' | 'refs' | 'thumbs' | 'frames' | 'audio' | 'exports'): Directory {
  const d = new Directory(projectDir(id), sub);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

function projectFile(id: string) {
  return new File(projectDir(id), 'project.json');
}

export function saveProjectSync(p: Project) {
  const f = projectFile(p.id);
  const tmp = new File(projectDir(p.id), 'project.json.tmp');
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.writeSync(JSON.stringify(p));
  if (f.exists) f.delete();
  tmp.moveSync(f);
}

export function loadProject(id: string): Project | null {
  try {
    const f = projectFile(id);
    if (!f.exists) return null;
    return migrate(JSON.parse(f.textSync()));
  } catch {
    return null;
  }
}

export function listProjects(): Project[] {
  const d = new Directory(root(), 'projects');
  if (!d.exists) return [];
  const out: Project[] = [];
  for (const item of d.list()) {
    if (item instanceof Directory) {
      const p = loadProject(item.name);
      if (p) out.push(p);
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function deleteProject(id: string) {
  const d = new Directory(root(), 'projects', id);
  if (d.exists) d.delete();
}

/** Copia um arquivo (câmera, galeria, cache) para a pasta do projeto. */
export async function importFile(uri: string, dest: Directory, name: string): Promise<string> {
  const src = new File(uri);
  const target = new File(dest, name);
  if (target.exists) target.delete();
  await src.copy(target);
  return target.uri;
}

export function removeFile(uri?: string) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // arquivo já não existe
  }
}

function migrate(p: Project): Project {
  return {
    ...p,
    skippedSceneIds: p.skippedSceneIds ?? [],
    clips: p.clips ?? {},
    edit: { ...{ originalVolume: 1, narrationVolume: 1 }, ...p.edit },
  };
}
