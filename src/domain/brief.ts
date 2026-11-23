// Extrai fatos do briefing. Os fatos do vídeo vêm SÓ daqui — nunca das referências.

export type BriefFacts = {
  dish: string | null; // "xis de costela"
  dishShort: string | null; // "xis"
  price: string | null; // "38 reais"
  priceRaw: string | null; // "R$ 38"
  place: string | null; // "Porto Alegre"
  wantsScale: boolean; // mostrar tamanho
  wantsVerdict: boolean; // contar se compraria de novo / se vale
  wantsPrep: boolean; // mostrar preparo
  isTasting: boolean; // vai provar/comer
};

const DISH_WORDS = [
  'xis', 'sanduíche', 'sanduiche', 'hambúrguer', 'hamburguer', 'burger', 'pizza', 'pastel', 'coxinha', 'esfiha',
  'lasanha', 'feijoada', 'churrasco', 'costela', 'picanha', 'sushi', 'temaki', 'ramen', 'lámen', 'lamen', 'taco',
  'açaí', 'acai', 'sorvete', 'bolo', 'torta', 'brigadeiro', 'croissant', 'pão', 'pao', 'café', 'cafe', 'prato feito',
  'pf', 'parmegiana', 'bife', 'frango', 'marmita', 'cachorro-quente', 'dog', 'tapioca', 'acarajé', 'acaraje',
  'moqueca', 'salgado', 'empada', 'beirute', 'bauru', 'chopp', 'drink', 'cerveja', 'poke', 'macarrão', 'macarrao',
  'massa', 'nhoque', 'risoto', 'buffet', 'rodízio', 'rodizio', 'omelete', 'panqueca', 'waffle', 'donut', 'churros',
];

const cap = (s: string) => s.replace(/\s+/g, ' ').trim();

export function parseBrief(brief: string): BriefFacts {
  const text = cap(brief);
  const lower = text.toLowerCase();

  // Preço: "R$ 38", "R$38,90", "38 reais"
  let priceRaw: string | null = null;
  let price: string | null = null;
  const m1 = text.match(/R\$\s?(\d+(?:[.,]\d{1,2})?)/i);
  const m2 = text.match(/(\d+(?:[.,]\d{1,2})?)\s?(reais|conto|pila)/i);
  const num = m1?.[1] ?? m2?.[1] ?? null;
  if (num) {
    priceRaw = m1 ? `R$ ${num}` : `${num} ${m2![2]}`;
    const clean = num.replace(/[.,]00$/, '');
    price = clean.includes(',') || clean.includes('.') ? `R$ ${clean.replace('.', ',')}` : `${clean} reais`;
  }

  // Prato: frase depois de verbos comuns ("provar um xis de costela de R$ 38")
  let dish: string | null = null;
  const dishMatch = lower.match(
    /(?:provar|experimentar|comer|testar|mostrar|gravar|pedir|avaliar)\s+(?:o|a|os|as|um|uma|uns|umas)?\s*([^.,;!?]+)/,
  );
  if (dishMatch) {
    dish = dishMatch[1]
      .replace(/\s+de\s+r\$.*$/, '')
      .replace(/\s+(por|a|em|no|na|que|pra|para|de\s+\d).*$/, '')
      .trim();
    if (dish.split(' ').length > 6) dish = dish.split(' ').slice(0, 5).join(' ');
  }
  let dishShort: string | null = null;
  for (const w of DISH_WORDS) {
    const re = new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'u');
    if (re.test(lower)) {
      dishShort = w;
      break;
    }
  }
  if (!dish && dishShort) dish = dishShort;
  if (dish && !dishShort) dishShort = dish.split(' ')[0];

  // Lugar: "em Porto Alegre", "no Mercado Público"
  let place: string | null = null;
  const placeMatch = text.match(/\b(?:em|no|na)\s+((?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\wáéíóúâêôãõç'-]*\s?){1,4})/);
  if (placeMatch) place = placeMatch[1].trim();

  return {
    dish,
    dishShort,
    price,
    priceRaw,
    place,
    wantsScale: /tamanho|grande|gigante|enorme|escala|porção|porcao|quanto vem/.test(lower),
    wantsVerdict: /compraria|vale a pena|vale\b|de novo|voltaria|nota|recomend|opini|achei|veredito/.test(lower),
    wantsPrep: /preparo|chapa|forno|fazendo|montando|grelha|fritando|cozinha/.test(lower),
    isTasting: /provar|experimentar|comer|testar|mordida|degust/.test(lower),
  };
}

export function titleFromBrief(brief: string): string {
  const f = parseBrief(brief);
  if (f.dish) {
    const t = f.dish.charAt(0).toUpperCase() + f.dish.slice(1);
    return f.place ? `${t} · ${f.place}` : t;
  }
  const words = cap(brief).split(' ').slice(0, 5).join(' ');
  return words || 'Projeto sem nome';
}

/** Assunto do vídeo em poucas palavras ("delineado gatinho", "fone bluetooth"). */
export function subjectFromBrief(brief: string, fallback: string): string {
  const lower = cap(brief).toLowerCase();
  const m = lower.match(
    /(?:review d[eoa]s?|tutorial d[eoa]s?|resenha d[eoa]s?|sobre|fazer|mostrar|ensinar|explicar|testar|provar|divulgar|apresentar|lan[çc]ar|falar d[eoa]s?|comentar|analisar)\s+(?:o|a|os|as|um|uma|uns|umas|meu|minha|meus|minhas|como)?\s*([^.,;!?]+)/,
  );
  if (!m) return fallback;
  let s = m[1];
  // tira prefixos que não são o assunto ("review de um", "em 60 segundos", "o que muda com a")
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/^(review|tutorial|resenha|v[ií]deo|unboxing|esquete|post|reels?)\s+(d[eoa]s?|sobre)\s+/, '')
      .replace(/^em \d+\s*(segundos|minutos|passos)\s+/, '')
      .replace(/^(o que muda com|o que [eé]|como|sobre)\s+/, '')
      .replace(/^(esquete|sketch|um esquete)\s+/, '')
      .replace(/^(montar|fazer|usar|criar|configurar|instalar|organizar)\s+/, '')
      .replace(/["“”']/g, '')
      .replace(/^(o|a|os|as|um|uma|uns|umas|meu|minha|meus|minhas|o novo|a nova)\s+/, '');
  }
  s = s
    .replace(/\s+(de|por|a|em|no|na|com|que|pra|para|e|at[eé])\s+(r\$|\d).*$/, '')
    .replace(/\s+(em|no|na|pra|para|que|e quero|e mostrar|e dar|e contar|com produtos|at[eé])\b.*$/, '')
    .trim();
  const words = s.split(' ');
  if (words.length > 5) s = words.slice(0, 5).join(' ');
  s = s.replace(/\s+(de|da|do|das|dos|em|com|e|o|a)$/, '').replace(/\s+(de|da|do|em|com|e)$/, '');
  if (!s) return fallback;
  // devolve com as maiúsculas originais (IPTU, iPhone)
  const original = cap(brief);
  const at = lower.indexOf(s);
  return at >= 0 ? original.slice(at, at + s.length) : s;
}
