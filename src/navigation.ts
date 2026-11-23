import type { Project } from './domain/types';

/** Para onde abrir um projeto, conforme a etapa em que ele parou. */
export function routeFor(p: Project): string {
  if (p.scriptApproved) return p.stage === 'edit' ? `/p/${p.id}/editor` : `/p/${p.id}/script`;
  if (p.scenes.length) return `/p/${p.id}/script`;
  if (p.hooks?.length) return `/p/${p.id}/hooks`;
  if (p.analysis) return `/p/${p.id}/style`;
  return `/p/${p.id}/refs`;
}
