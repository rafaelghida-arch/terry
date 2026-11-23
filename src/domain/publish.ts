// Sugestões para publicar: 3 hashtags do nicho, título, descrição e uma recomendação de trilha.
// Sem IA, sai daqui: hashtags conhecidas de cada nicho e texto montado só com os fatos do briefing.

import { parseBrief, subjectFromBrief } from './brief';
import { forms } from './scriptLocal';
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

const IRREGULAR: Record<string, string> = {
  fazer: 'fiz', ir: 'fui', ver: 'vi', trazer: 'trouxe', dizer: 'disse', ter: 'tive', pôr: 'pus', por: 'pus', vir: 'vim', dar: 'dei', ser: 'fui', estar: 'estive',
};

/** Infinitivo → passado em 1ª pessoa ("mostrar" → "mostrei", "explicar" → "expliquei"). */
export function pastFirstPerson(verb: string): string {
  const v = verb.toLowerCase();
  if (IRREGULAR[v]) return IRREGULAR[v];
  if (v.endsWith('car')) return v.slice(0, -3) + 'quei';
  if (v.endsWith('gar')) return v.slice(0, -3) + 'guei';
  if (v.endsWith('çar')) return v.slice(0, -3) + 'cei';
  if (v.endsWith('ar')) return v.slice(0, -2) + 'ei';
  if (v.endsWith('er') || v.endsWith('ir')) return v.slice(0, -2) + 'i';
  return v;
}

const LEAD = /^(vou|quero|pretendo|vamos|eu vou|hoje vou|hoje eu vou)\s+/i;
const INF = /^([a-zà-ú]+(?:ar|er|ir|ôr|or))\b/i;

/** Uma frase do briefing contada como coisa feita ("Quero mostrar X e contar Y" → "Mostrei X e contei Y"). */
function toPast(sentence: string): string {
  let out = sentence.trim();
  if (!LEAD.test(out)) return out;
  out = out.replace(LEAD, '');
  const m = out.match(INF);
  if (!m) return out;
  out = pastFirstPerson(m[1]) + out.slice(m[1].length);
  // verbos coordenados: "... e contar se ..." → "... e contei se ..."
  out = out.replace(/\b(e|,)\s+([a-zà-ú]+(?:ar|er|ir))\b(?=\s)/gi, (all, sep, verb) => (/(?:ar|er|ir)$/i.test(verb) && (verb.length > 3 || IRREGULAR[verb.toLowerCase()]) ? `${sep} ${pastFirstPerson(verb)}` : all));
  return out;
}

/** Descrição: as duas primeiras frases do briefing, contadas como coisa que aconteceu. */
export function descriptionFromBrief(brief: string): string {
  const sentences = brief.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 2);
  const out = sentences
    .map(toPast)
    .map((x) => x.replace(/^(fiz|testei|mostrei) (um |o )?review de/i, 'Review de'))
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .map((x) => (/[.!?]$/.test(x) ? x : `${x}.`));
  return out.join(' ');
}

const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Título no jeito do nicho, só com o que está no briefing. */
export function titleFor(brief: string, fallback: string, genre: Genre): string {
  const f = parseBrief(brief);
  const subject = subjectFromBrief(brief, '');
  const lower = brief.toLowerCase();
  const S = subject ? cap(subject) : fallback;
  switch (genre) {
    case 'gastronomia':
      return f.dish ? `${cap(f.dish)}${f.priceRaw ? ` de ${f.priceRaw}` : ''}${f.place ? ` em ${f.place}` : ''}` : fallback;
    case 'review':
      return f.priceRaw ? `${S} de ${f.priceRaw}: vale a pena?` : f.wantsVerdict ? `${S}: vale a pena?` : `Testei ${forms(subject || 'produto').o} ${subject || 'produto'}`;
    case 'beleza':
      return /barat|pouco|econ[oô]m/.test(lower) ? `${S} gastando pouco` : /fim do dia|dura|resist/.test(lower) ? `${S}: dura o dia todo?` : `${S} passo a passo`;
    case 'tutorial': {
      const n = lower.match(/(\d+)\s*passos?/);
      return n ? `${S} em ${n[1]} passos` : `Como fazer ${subject || 'isso'}`;
    }
    case 'opiniao':
      return subject ? `O que muda com ${forms(subject).o} ${subject}` : fallback;
    case 'marketing': {
      const off = brief.match(/(\d+)\s*%/);
      return off ? `${S} com ${off[1]}% off` : S;
    }
    case 'vlog':
      return f.place && !S.includes(f.place) ? `${S} em ${f.place}` : S;
    case 'fitness': {
      const min = lower.match(/(\d+)\s*min/);
      return `${S}${min ? ` de ${min[1]} minutos` : ''}${/sem equipamento/.test(lower) ? ' sem equipamento' : ''}`;
    }
    default:
      return subject ? S : fallback;
  }
}

export function localPublishIdea(input: { brief: string; title: string; genre: Genre }): PublishIdea {
  const fallback = input.title.replace(/^Demonstração · /, '');
  return {
    hashtags: HASHTAGS[input.genre],
    title: titleFor(input.brief, fallback, input.genre).slice(0, 70),
    description: descriptionFromBrief(input.brief),
    sound: SOUND[input.genre],
    source: 'local',
  };
}

export function publishText(p: PublishIdea): string {
  return `${p.title}\n\n${p.description}\n\n${p.hashtags.join(' ')}`;
}
