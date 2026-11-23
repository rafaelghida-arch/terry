// A voz do TERRY: frases curtas, ditas só quando há algo concreto a dizer.
// Variações escolhidas de forma estável por projeto para não repetir bordão.

import { parseBrief } from './brief';
import type { Project, Scene } from './types';
import { buildTimeline, formatDuration } from './timeline';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}
const pick = (seed: string, options: string[]) => options[hash(seed) % options.length];

export const terry = {
  start: () => 'Me mostra uns vídeos que têm a sua cara.',

  briefPrompt: () => 'O que tu vai gravar hoje?',

  references(p: Project): string | null {
    const n = p.references.length;
    if (n === 0) return 'Me mostra uns vídeos que têm a sua cara. Pode ser TikTok salvo na galeria.';
    if (n === 1) return pick(p.id + 'r1', ['Se tiver mais um, ajuda a separar o que é estilo do que é acaso.', 'Com mais um eu consigo ver o que se repete.']);
    return null;
  },

  analysisUnavailable: (reason: 'sem_servidor' | 'falha') =>
    reason === 'sem_servidor'
      ? 'A análise por IA não está ligada neste aparelho. Medi ritmo e som aqui mesmo; o que eu não vi, você completa.'
      : 'Não consegui falar com a análise agora. Medi ritmo e som aqui no celular; você pode tentar de novo depois.',

  divergent: () => 'Essas referências puxam pra lados diferentes. Qual tem mais a sua cara?',

  hookChoice(p: Project): string | null {
    return p.analysis?.terryLine ?? null;
  },

  /** Linha para o quadro de tomadas. */
  shoot(p: Project): string | null {
    const tl = buildTimeline(p);
    const done = tl.segments.length;
    const total = p.scenes.length;
    if (done === 0) {
      const first = p.scenes[0];
      if (!first) return null;
      return pick(p.id + 'shoot0', [
        'Não precisa seguir a ordem. Grava o que estiver na sua frente.',
        'Pode começar por qualquer tomada. Eu ponho cada uma no lugar.',
      ]);
    }
    if (tl.missing.length === 0) return 'Tudo gravado. Já dá pra montar o primeiro corte.';
    if (done >= 2) {
      const fachada = tl.missing.find((s) => s.role === 'fachada');
      if (fachada && tl.missing.length === 1) return 'Já dá pra montar. Quer usar o corte sem a fachada ou gravar essa parte?';
      if (tl.missing.length === 1) return `Já dá pra montar. Falta só “${tl.missing[0].title}”: grava ou monta sem ela.`;
    }
    if (done >= total - 2 && total > 3) return `Faltam ${tl.missing.length}. Dá pra montar sem elas também.`;
    return null;
  },

  /** Dica na tela de gravação (a da cena, ou uma derivada do papel dela). */
  recordTip(scene: Scene, p: Project): string {
    if (scene.tip) return scene.tip;
    const f = parseBrief(p.brief);
    switch (scene.role) {
      case 'mordida':
        return 'Deixa essa fala em aberto. Grava e me conta o que você achou na hora.';
      case 'fachada':
        return 'Pode gravar na saída. Eu encaixo onde ela estiver no roteiro.';
      case 'escala':
        return `Mão aberta embaixo do ${f.dishShort ?? 'prato'}. É o tamanho que importa aqui.`;
      default:
        return 'Segura o celular firme e grava um pouco antes e depois. Eu corto.';
    }
  },

  clipAdded(clipDuration: number, scene: Scene, trimmed: { start: number; end: number; trimmed: boolean }): string | null {
    if (trimmed.trimmed) {
      return `Ficou com ${Math.round(clipDuration)}s. Separei ${Math.round(trimmed.end - trimmed.start)}s que parecem o melhor trecho, ajusta se quiser.`;
    }
    if (clipDuration < scene.duration * 0.6) return `Ficou mais curto que o previsto. Tudo bem, o vídeo encurta junto.`;
    return null;
  },

  review(p: Project): string {
    const tl = buildTimeline(p);
    const firstSpeech = tl.segments.find((s) => p.scenes[s.sceneIndex]?.line);
    if (firstSpeech && p.audioModes.includes('fala')) return 'O primeiro corte tá pronto. Dá uma olhada na entrada da sua fala.';
    if (p.audioModes.includes('narracao') && !p.edit.narration) return 'O primeiro corte tá pronto. Quando quiser, grava a narração por cima.';
    return `O primeiro corte tá pronto, ${formatDuration(tl.total)}. Confere se o som da abertura não ficou cortado.`;
  },

  exportDone: (saved: boolean) => (saved ? 'Tá na sua galeria.' : 'Vídeo pronto. Salva ou manda pra onde quiser.'),
  exportFailed: () => 'A exportação falhou. Sua edição está salva; dá pra tentar de novo.',
};
