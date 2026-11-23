// Sugestões para publicar: 3 hashtags do nicho, título, descrição e uma recomendação de trilha.
// Sem IA, sai daqui: hashtags conhecidas de cada nicho e texto montado só com os fatos do briefing.

import { parseBrief } from './brief';
import type { Genre } from './genres';

export type PublishIdea = {
  hashtags: string[];
  title: string;
  description: string;
  sound: { kind: string; search: string; why: string };
  source: 'ia' | 'local';
};

/** As 3 hashtags mais usadas e reconhecidas de cada nicho no Brasil (sem #fyp/#viral). */
const HASHTAGS: Record<Genre, string[]> = {
  gastronomia: ['#gastronomia', '#comida', '#foodie'],
  beleza: ['#maquiagem', '#make', '#beleza'],
  review: ['#review', '#resenha', '#unboxing'],
  marketing: ['#empreendedorismo', '#marketingdigital', '#pequenosnegocios'],
  opiniao: ['#politica', '#noticias', '#brasil'],
  tutorial: ['#tutorial', '#dicas', '#aprendanotiktok'],
  vlog: ['#vlog', '#rotina', '#viagem'],
  fitness: ['#treino', '#academia', '#fitness'],
  humor: ['#humor', '#comedia', '#memes'],
  outro: ['#dicas', '#rotina', '#brasil'],
};

const SOUND: Record<Genre, PublishIdea['sound']> = {
  gastronomia: { kind: 'Lo-fi ou bossa instrumental, baixinho', search: 'lofi cozinha', why: 'Deixa o som da comida e a sua fala na frente.' },
  beleza: { kind: 'Pop suave instrumental', search: 'get ready with me instrumental', why: 'Acompanha o ritmo dos passos sem brigar com a explicação.' },
  review: { kind: 'Batida eletrônica leve, sem voz', search: 'tech review background', why: 'Dá ritmo sem tirar atenção do produto e do teste.' },
  marketing: { kind: 'Instrumental animado e limpo', search: 'upbeat corporate', why: 'Passa energia sem parecer anúncio de TV.' },
  opiniao: { kind: 'Sem trilha, ou um piano bem discreto', search: 'piano ambiente', why: 'Em vídeo de opinião, a sua voz é o que importa.' },
  tutorial: { kind: 'Lo-fi instrumental', search: 'lofi study', why: 'Ajuda a manter o ritmo dos passos sem distrair.' },
  vlog: { kind: 'Indie acústico ou chill', search: 'vlog chill acoustic', why: 'É o som que costuma acompanhar planos de passagem.' },
  fitness: { kind: 'Eletrônica ou funk instrumental com batida marcada', search: 'workout beat', why: 'A batida combina com o ritmo das repetições.' },
  humor: { kind: 'Som de trend do momento ou nenhum', search: 'comedy sound effect', why: 'Em humor, o timing da fala vem antes da música.' },
  outro: { kind: 'Instrumental leve', search: 'background instrumental', why: 'Fica por baixo sem competir com o som real do vídeo.' },
};

const PAST: [RegExp, string][] = [
  [/^vou provar\b/i, 'Provei'],
  [/^vou experimentar\b/i, 'Experimentei'],
  [/^vou testar\b/i, 'Testei'],
  [/^vou fazer\b/i, 'Fiz'],
  [/^vou mostrar\b/i, 'Mostrei'],
  [/^vou ensinar\b/i, 'Ensinei'],
  [/^vou explicar\b/i, 'Expliquei'],
  [/^vou divulgar\b/i, 'Chegou'],
  [/^quero mostrar\b/i, 'Mostrei'],
  [/^quero explicar\b/i, 'Expliquei'],
];

/** Primeira frase do briefing, contada como coisa que aconteceu ("Vou provar" → "Provei"). */
export function descriptionFromBrief(brief: string): string {
  const first = brief.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/)[0] ?? '';
  let out = first;
  for (const [re, rep] of PAST) {
    if (re.test(out)) {
      out = out.replace(re, rep);
      break;
    }
  }
  out = out.replace(/^(Fiz|Testei|Mostrei) review de/i, 'Review de');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function localPublishIdea(input: { brief: string; title: string; genre: Genre }): PublishIdea {
  const f = parseBrief(input.brief);
  let title = input.title.replace(/^Demonstração · /, '');
  if (input.genre === 'review' && f.wantsVerdict && !/vale/i.test(title)) title = `${title}: vale a pena?`;
  if (input.genre === 'gastronomia' && f.dish) title = `${f.dish.charAt(0).toUpperCase()}${f.dish.slice(1)}${f.priceRaw ? ` de ${f.priceRaw}` : ''}${f.place ? ` em ${f.place}` : ''}`;
  return {
    hashtags: HASHTAGS[input.genre],
    title: title.slice(0, 60),
    description: descriptionFromBrief(input.brief),
    sound: SOUND[input.genre],
    source: 'local',
  };
}

export function publishText(p: PublishIdea): string {
  return `${p.title}\n\n${p.description}\n\n${p.hashtags.join(' ')}`;
}
