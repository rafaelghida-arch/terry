// A voz do TERRY: frases curtas, ditas só quando há algo concreto a dizer.
// Variações escolhidas de forma estável por projeto para não repetir bordão.

import { parseBrief } from './brief';
import { effectiveGenre, GENRE_INFO, PLANS, type Genre } from './genres';
import { forms } from './scriptLocal';
import type { Project, Scene } from './types';
import { buildTimeline, formatDuration } from './timeline';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}
const pick = (seed: string, options: string[]) => options[hash(seed) % options.length];

export const terry = {
  start: (genre?: Genre) => GENRE_INFO[genre ?? 'gastronomia'].start,

  briefPrompt: () => 'O que tu vai gravar hoje?',

  references(p: Project): string | null {
    const n = p.references.length;
    if (n === 0) return `${GENRE_INFO[p.genre ?? 'gastronomia'].start} Pode ser TikTok ou Reels salvo na galeria.`;
    if (n === 1) return pick(p.id + 'r1', ['Se tiver mais um, ajuda a separar o que é estilo do que é acaso.', 'Com mais um eu consigo ver o que se repete.']);
    return null;
  },

  analysisUnavailable: (reason: 'sem_servidor' | 'falha') =>
    reason === 'sem_servidor'
      ? 'A análise por IA não está ligada neste aparelho. Medi ritmo e som aqui mesmo; o que eu não vi, você completa.'
      : 'Não consegui falar com a análise agora. Medi ritmo e som aqui no celular; você pode tentar de novo depois.',

  /** As referências parecem de outro tipo de conteúdo que o briefing. */
  genreMismatch(p: Project): string | null {
    const detected = p.analysis?.genre?.detected;
    const chosen = p.genre ?? 'gastronomia';
    if (!detected || detected === chosen || detected === 'outro') return null;
    if (chosen === 'outro') return `Pelas suas referências, isso parece ${GENRE_INFO[detected].label.toLowerCase()}. Vou montar o roteiro nesse estilo.`;
    return `Suas referências parecem ${GENRE_INFO[detected].label.toLowerCase()}, e o briefing fala de ${GENRE_INFO[chosen].label.toLowerCase()}. Sigo qual?`;
  },

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
        {
        const w = f.dishShort ?? 'prato';
        return `Mão aberta embaixo ${forms(w).do} ${w}. É o tamanho que importa aqui.`;
      }
      default:
        { const g = effectiveGenre(p.genre, p.analysis?.genre?.detected); if (g !== 'gastronomia') return PLANS[g].recordTip; }
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
    const g = effectiveGenre(p.genre, p.analysis?.genre?.detected);
    const byGenre: Partial<Record<Genre, string>> = {
      beleza: 'O primeiro corte tá pronto. Confere se a luz do antes e do resultado ficou igual.',
      review: 'O primeiro corte tá pronto. Confere se o produto aparece com a marca legível.',
      marketing: 'O primeiro corte tá pronto. Confere se a chamada do fim está clara e com a oferta certa.',
      opiniao: 'O primeiro corte tá pronto. Confere se a fonte aparece quando você cita o dado.',
      tutorial: 'O primeiro corte tá pronto. Confere se dá pra seguir cada passo sem pausar.',
      vlog: 'O primeiro corte tá pronto. Confere se a sua fala do meio não ficou cortada.',
      fitness: 'O primeiro corte tá pronto. Confere se cada exercício aparece inteiro, sem cortar a repetição.',
      humor: 'O primeiro corte tá pronto. Confere o tempo da virada: o corte vem logo depois da última fala.',
    };
    if (byGenre[g]) return byGenre[g]!;
    const firstSpeech = tl.segments.find((s) => p.scenes[s.sceneIndex]?.line);
    if (firstSpeech && p.audioModes.includes('fala')) return 'O primeiro corte tá pronto. Dá uma olhada na entrada da sua fala.';
    if (p.audioModes.includes('narracao') && !p.edit.narration) return 'O primeiro corte tá pronto. Quando quiser, grava a narração por cima.';
    return `O primeiro corte tá pronto, ${formatDuration(tl.total)}. Confere se o som da abertura não ficou cortado.`;
  },

  exportDone: (saved: boolean) => (saved ? 'Tá na sua galeria.' : 'Vídeo pronto. Salva ou manda pra onde quiser.'),
  exportFailed: () => 'A exportação falhou. Sua edição está salva; dá pra tentar de novo.',
};
