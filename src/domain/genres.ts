// Tipos de conteúdo que o TERRY entende. Cada gênero traz o próprio vocabulário de filmagem:
// ganchos, tomadas, dicas na hora de gravar e regras do que nunca inventar.

import type { AudioMode, SceneRole } from './types';

export type Genre =
  | 'gastronomia'
  | 'beleza'
  | 'review'
  | 'marketing'
  | 'opiniao'
  | 'tutorial'
  | 'vlog'
  | 'fitness'
  | 'humor'
  | 'outro';

export const GENRES: Genre[] = ['gastronomia', 'beleza', 'review', 'marketing', 'opiniao', 'tutorial', 'vlog', 'fitness', 'humor', 'outro'];

export type GenreInfo = {
  label: string;
  short: string;
  /** Palavras que indicam o gênero no briefing. */
  keywords: RegExp;
  /** Substantivo genérico quando o briefing não diz o assunto. */
  fallbackSubject: string;
  /** Exemplo de briefing mostrado no campo de texto. */
  example: string;
  /** Regras de conteúdo (vão para a IA e guiam o roteiro local). */
  rules: string;
  /** O que o TERRY pede quando o criador começa. */
  start: string;
};

export const GENRE_INFO: Record<Genre, GenreInfo> = {
  gastronomia: {
    label: 'Gastronomia',
    short: 'Comida',
    keywords: /\b(xis|sandu[ií]che|hamb[uú]rguer|burger|pizza|pastel|coxinha|restaurante|lanchonete|prato|comida|receita|comer|provar|card[aá]pio|churrasco|sushi|doce|bolo|caf[eé]|bar|boteco|chapa|petisco|a[cç]a[ií]|sorvete|feijoada|costela)\b/i,
    fallbackSubject: 'prato',
    example: 'Vou provar um xis de costela de R$ 38 em Porto Alegre. Quero mostrar o tamanho e contar se compraria de novo.',
    rules: 'Fatos (prato, preço, lugar) só do briefing. A tomada da mordida fica sem fala escrita: a reação é do criador.',
    start: 'Me mostra uns vídeos de comida que têm a sua cara.',
  },
  beleza: {
    label: 'Beleza e maquiagem',
    short: 'Beleza',
    keywords: /\b(maquiagem|make|makeup|delineado|batom|base|corretivo|sombra|r[ií]mel|m[aá]scara de c[ií]lios|skincare|pele|cabelo|penteado|unha|esmalte|perfume|blush|contorno|sobrancelha|glow|look)\b/i,
    fallbackSubject: 'make',
    example: 'Vou fazer um delineado gatinho com produtos baratos e mostrar como fica no fim do dia.',
    rules: 'Produtos, marcas e preços só do briefing. Nada de prometer resultado de pele ou efeito que o criador não testou. Antes/depois só com a mesma luz e o mesmo ângulo.',
    start: 'Me mostra uns tutoriais ou looks que têm a sua cara.',
  },
  review: {
    label: 'Review de produto',
    short: 'Review',
    keywords: /\b(review|resenha|unboxing|testei|testar|vale a pena|comprei|produto|fone|celular|iphone|notebook|c[aâ]mera|t[eê]nis|gadget|aparelho|comparar|compara[cç][aã]o|pr[oó]s e contras)\b/i,
    fallbackSubject: 'produto',
    example: 'Vou fazer review de um fone bluetooth de R$ 150. Quero mostrar o som, a bateria e se vale a pena.',
    rules: 'Especificações, preço e onde comprar só do briefing ou do que o criador mostrar. O veredito é do criador, nunca escrito pelo TERRY. Se for publi, avisar no começo.',
    start: 'Me mostra uns reviews que você curte o jeito.',
  },
  marketing: {
    label: 'Marketing e marca',
    short: 'Marketing',
    keywords: /\b(marca|campanha|lan[cç]amento|publi|publicidade|an[uú]ncio|loja|promo[cç][aã]o|desconto|cliente|venda|vender|neg[oó]cio|empresa|servi[cç]o|cupom|black friday|divulgar)\b/i,
    fallbackSubject: 'produto',
    example: 'Vou divulgar o lançamento da nova linha de cafés da minha loja, com 20% de desconto até domingo.',
    rules: 'Oferta, prazo, preço e condições só do briefing, escritos do jeito que o criador passou. Uma chamada para ação clara no fim. Nada de afirmação que a marca não possa comprovar.',
    start: 'Me mostra uns vídeos de marca que você gostaria de ter feito.',
  },
  opiniao: {
    label: 'Política e opinião',
    short: 'Opinião',
    keywords: /\b(pol[ií]tica|governo|elei[cç][aã]o|candidato|deputad[oa]|prefeit[oa]|presidente|lei|projeto de lei|vota[cç][aã]o|opini[aã]o|debate|not[ií]cia|economia|imposto|direitos|pol[eê]mica|comentar|analisar)\b/i,
    fallbackSubject: 'tema',
    example: 'Quero explicar em 60 segundos o que muda com a nova lei do IPTU na minha cidade e dar minha opinião.',
    rules: 'Dados, números e citações só do briefing, e com a fonte na tela. Separar fato de opinião. A opinião é do criador: o TERRY não escreve posição política nem ataques a pessoas.',
    start: 'Me mostra uns vídeos de opinião ou notícia que têm o seu jeito.',
  },
  tutorial: {
    label: 'Tutorial e explicação',
    short: 'Tutorial',
    keywords: /\b(tutorial|passo a passo|como fazer|ensinar|explicar|dica|aprender|aula|truque|configurar|montar|instalar|guia)\b/i,
    fallbackSubject: 'assunto',
    example: 'Vou ensinar a montar uma planilha de gastos no celular em 3 passos.',
    rules: 'Os passos vêm do briefing e da demonstração real do criador. Mostrar o resultado logo no começo. Nada de passo inventado.',
    start: 'Me mostra uns tutoriais que você acha fáceis de seguir.',
  },
  vlog: {
    label: 'Vlog e rotina',
    short: 'Vlog',
    keywords: /\b(vlog|rotina|dia comigo|viagem|viajar|passeio|rol[eê]|minha manh[aã]|meu dia|um dia|dia de folga|folga|p[oô]r do sol|conhecer a cidade|arrume-se|arrume se|grwm|mudan[cç]a|casa nova|f[eé]rias)\b/i,
    fallbackSubject: 'dia',
    example: 'Vou mostrar um dia de folga em Gramado, do café da manhã até o pôr do sol.',
    rules: 'Lugares e acontecimentos são os do dia real do criador. Planos curtos de passagem, uma fala sincera no meio, fechamento leve.',
    start: 'Me mostra uns vlogs com o ritmo que você gosta.',
  },
  fitness: {
    label: 'Fitness e treino',
    short: 'Fitness',
    keywords: /\b(treino|academia|exerc[ií]cio|muscula[cç][aã]o|corrida|correr|alongamento|abd[oô]men|gl[uú]teo|perna|bra[cç]o|crossfit|yoga|pilates|dieta|shape|s[eé]rie|repeti[cç][oõ]es)\b/i,
    fallbackSubject: 'treino',
    example: 'Vou mostrar um treino de pernas de 20 minutos para fazer em casa, sem equipamento.',
    rules: 'Exercícios, séries e repetições só do briefing. Mostrar a execução inteira de lado. Nada de promessa de resultado ou orientação de saúde que o criador não deu.',
    start: 'Me mostra uns vídeos de treino que têm a sua cara.',
  },
  humor: {
    label: 'Humor',
    short: 'Humor',
    keywords: /\b(humor|com[eé]dia|esquete|piada|meme|zoeira|engra[cç]ado|pov|tipos de|quando voc[eê]|trend|sketch)\b/i,
    fallbackSubject: 'situação',
    example: 'Quero fazer um esquete "tipos de cliente na padaria" com 4 personagens.',
    rules: 'A piada e as falas são do criador; o TERRY organiza o tempo. Ritmo rápido, virada no fim. Nada de piada com grupos ou pessoas reais.',
    start: 'Me mostra uns vídeos de humor com o timing que você gosta.',
  },
  outro: {
    label: 'Outro',
    short: 'Outro',
    keywords: /(?!)/, // nunca é detectado pelo briefing: é escolha do criador
    fallbackSubject: 'assunto',
    example: 'Conta o que você vai gravar, do seu jeito. Eu sigo o estilo dos vídeos que você me mostrar.',
    rules: 'O tipo de conteúdo vem das referências. Fatos só do briefing. Opiniões e reações são do criador, nunca escritas.',
    start: 'Me mostra uns vídeos que têm a sua cara. Eu sigo o estilo deles.',
  },
};

/** Gênero que o roteiro usa: em "Outro", o que as referências mostram (quando a IA identificou). */
export function effectiveGenre(chosen: Genre | undefined, detected?: Genre): Genre {
  const g = chosen ?? 'gastronomia';
  if (g === 'outro' && detected && detected !== 'outro') return detected;
  return g;
}

/** Gênero mais provável pelo briefing. */
export function detectGenre(brief: string): { genre: Genre; confident: boolean } {
  const scores = GENRES.map((g) => {
    const re = new RegExp(GENRE_INFO[g].keywords.source, 'gi');
    return { g, n: (brief.match(re) ?? []).length };
  }).sort((a, b) => b.n - a.n);
  if (!scores[0].n) return { genre: 'outro', confident: false };
  return { genre: scores[0].g, confident: scores[0].n > (scores[1]?.n ?? 0) };
}

// ---------------------------------------------------------------------------
// Tomadas por gênero

export type ShotCtx = {
  subject: string; // "delineado", "fone bluetooth"
  /** Artigos e preposições que concordam com o assunto. */
  s: { o: string; do: string; no: string; um: string; esse: string; pronto: string; inteiro: string };
  price: string | null;
  place: string | null;
  modes: AudioMode[];
  wantsVerdict: boolean;
};

export type ShotTemplate = {
  role: SceneRole;
  duration: number;
  title: (c: ShotCtx) => string;
  instruction: (c: ShotCtx) => string;
  /** Como o áudio funciona nessa tomada. */
  audio: 'fala' | 'som' | 'silencio' | 'reacao';
  line?: (c: ShotCtx) => string | undefined;
  tip?: string;
};

export type HookTemplate = {
  key: string;
  /** 'fala' = abre com o criador falando; 'visual' = abre com imagem/som. */
  kind: 'fala' | 'visual';
  title: (c: ShotCtx) => string;
  approach: string;
  shot: ShotTemplate;
};

export type GenrePlan = {
  hooks: HookTemplate[];
  /** Miolo em ordem; os primeiros são essenciais, os do fim saem quando o vídeo é curto. */
  body: ShotTemplate[];
  ending: ShotTemplate;
  /** Dica padrão de gravação para o gênero. */
  recordTip: string;
};

const T = (t: ShotTemplate) => t;

export const PLANS: Record<Exclude<Genre, 'gastronomia'>, GenrePlan> = {
  beleza: {
    recordTip: 'Luz de janela de frente, celular na altura dos olhos. Mesma luz do começo ao fim.',
    hooks: [
      {
        key: 'resultado', kind: 'visual', title: () => 'Abrir com o resultado pronto',
        approach: 'Mostra o resultado final primeiro e depois volta pro começo.',
        shot: T({ role: 'gancho', duration: 3, audio: 'silencio', title: (c) => `${cap(c.subject)} ${c.s.pronto}`, instruction: (c) => `Close no rosto já com ${o(c)} ${c.s.pronto}, virando devagar de um lado pro outro na luz.`, tip: 'Grava o final antes de tirar a make. Depois você grava o começo.' }),
      },
      {
        key: 'antes', kind: 'visual', title: () => 'Antes e depois de cara',
        approach: 'Abre com o rosto sem nada e corta seco pro resultado.',
        shot: T({ role: 'antes', duration: 3, audio: 'silencio', title: () => 'Antes, mesma luz', instruction: () => 'Rosto limpo, mesmo enquadramento que vai usar no depois. Marca onde o celular está.', tip: 'Não mexe no celular entre o antes e o depois. É isso que faz o corte funcionar.' }),
      },
      {
        key: 'promessa', kind: 'fala', title: (c) => `Você falando o que vai ensinar`,
        approach: 'Abre com você olhando pra câmera e dizendo, em uma frase, o que a pessoa vai aprender.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'Uma frase pra câmera', instruction: () => 'Rosto em close, olhando pra lente.', line: (c) => (c.price ? `${cap(c.subject)} gastando ${c.price}.` : `${cap(c.subject)} do jeito mais fácil que eu conheço.`), tip: 'Fala a frase inteira de uma vez. Se travar, repete sem cortar.' }),
      },
    ],
    body: [
      T({ role: 'demonstracao', duration: 3, audio: 'silencio', title: () => 'Produtos na mão', instruction: () => 'Mostra os produtos que vai usar, um de cada vez, perto da câmera e com o rótulo virado pra lente.', tip: 'Segura cada produto parado por um segundo. Dá tempo de ler.' }),
      T({ role: 'passo', duration: 4, audio: 'fala', title: () => 'Primeiro passo de perto', instruction: () => 'Aplica o primeiro produto bem perto da câmera, movimento devagar.', line: () => 'Explica o passo com as suas palavras.' }),
      T({ role: 'passo', duration: 4, audio: 'fala', title: () => 'O passo que mais erra', instruction: () => 'Repete o passo mais difícil, ainda mais perto. Mostra o erro comum e o jeito certo.', tip: 'Esse é o momento que salva o vídeo. Grava duas vezes.' }),
      T({ role: 'detalhe', duration: 2, audio: 'silencio', title: () => 'Detalhe do acabamento', instruction: () => 'Close bem perto do resultado, com luz batendo de lado.' }),
      T({ role: 'antes', duration: 2, audio: 'silencio', title: () => 'Antes, mesma luz', instruction: () => 'Rosto antes de começar, mesmo enquadramento do resultado.' }),
    ],
    ending: T({ role: 'resultado', duration: 4, audio: 'reacao', title: () => 'Resultado e sua opinião', instruction: () => 'Resultado final em close e depois a sua opinião sincera sobre o que deu certo.', tip: 'Fala o que achou de verdade, inclusive o que não gostou.' }),
  },

  review: {
    recordTip: 'Produto sempre com a marca virada pra câmera. Fundo limpo, sem outro produto aparecendo.',
    hooks: [
      {
        key: 'pergunta', kind: 'fala', title: (c) => `Pergunta com ${o(c)} na mão`,
        approach: 'Abre com você segurando o produto e fazendo a pergunta que o review responde.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: (c) => `Pergunta com ${o(c)} na mão`, instruction: (c) => `Segura ${o(c)} ao lado do rosto, olhando pra câmera, e pergunta.`, line: (c) => (c.price ? `${cap(c.subject)} de ${c.price}: vale a pena?` : `Será que ${c.s.esse} ${c.subject} entrega o que promete?`), tip: 'Produto parado e em foco, rosto um pouco atrás.' }),
      },
      {
        key: 'unbox', kind: 'visual', title: () => 'Abrir pela caixa',
        approach: 'Começa com as mãos abrindo a caixa, de cima, só com o som.',
        shot: T({ role: 'gancho', duration: 4, audio: 'som', title: () => 'Abrindo a caixa', instruction: () => 'Celular apoiado em cima da mesa, filmando de cima. Abre a caixa devagar.', tip: 'Deixa o som do lacre e do papel. Ninguém fala nos primeiros segundos.' }),
      },
      {
        key: 'veredito_teaser', kind: 'fala', title: () => 'Teaser do problema',
        approach: 'Abre mostrando o detalhe que mais te surpreendeu, bom ou ruim, sem contar o veredito.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'O detalhe que surpreendeu', instruction: () => 'Close no detalhe do produto que mais chamou sua atenção.', line: () => 'Uma frase sobre o detalhe, sem dar o veredito.' }),
      },
    ],
    body: [
      T({ role: 'produto', duration: 3, audio: 'silencio', title: () => 'Produto inteiro, 360°', instruction: (c) => `Gira ${o(c)} devagar na mão, uma volta completa, com luz de frente.` }),
      T({ role: 'demonstracao', duration: 5, audio: 'fala', title: () => 'Usando de verdade', instruction: (c) => `Mostra ${o(c)} em uso, na situação real em que você usaria.`, line: () => 'Comenta o que está sentindo enquanto usa.', tip: 'Uso real vale mais que lista de especificação.' }),
      T({ role: 'prova', duration: 4, audio: 'fala', title: () => 'O teste que importa', instruction: () => 'Faz um teste simples que qualquer pessoa entende e mostra o resultado na tela.', line: () => 'Diz o que você testou e o que aconteceu.' }),
      T({ role: 'detalhe', duration: 2, audio: 'silencio', title: () => 'Ponto fraco de perto', instruction: () => 'Close no ponto que decepcionou ou pode decepcionar.' }),
      T({ role: 'contexto', duration: 2, audio: 'fala', title: () => 'Preço e onde comprou', instruction: () => 'Produto na mesa e você falando preço e onde comprou.', line: (c) => (c.price ? `Paguei ${c.price}.` : undefined) }),
    ],
    ending: T({ role: 'fechamento', duration: 4, audio: 'reacao', title: () => 'Seu veredito', instruction: () => 'Olha pra câmera e diz se compraria de novo e pra quem serve.', tip: 'O veredito é seu. Pode ser "depende" — só diz do quê.' }),
  },

  marketing: {
    recordTip: 'Produto ou serviço sempre bem iluminado e no centro. Marca legível pelo menos uma vez.',
    hooks: [
      {
        key: 'dor', kind: 'fala', title: () => 'Abrir pelo problema do cliente',
        approach: 'Abre com a situação que o cliente vive, antes de mostrar a marca.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'O problema em uma frase', instruction: () => 'Você ou um cliente olhando pra câmera, frase curta sobre o problema.', line: () => 'O problema que o seu cliente reconhece na hora.', tip: 'Fala como cliente, não como empresa.' }),
      },
      {
        key: 'produto_heroi', kind: 'visual', title: (c) => `${cap(c.subject)} como protagonista`,
        approach: 'Abre com o produto em close, movimento lento, só o som do lugar.',
        shot: T({ role: 'gancho', duration: 3, audio: 'som', title: (c) => `${cap(c.subject)} em close`, instruction: (c) => `Close ${c.s.no} ${c.subject}, câmera se aproximando devagar com a mão.`, tip: 'Limpa o fundo antes. Um objeto a mais tira a atenção.' }),
      },
      {
        key: 'bastidor', kind: 'visual', title: () => 'Abrir pelos bastidores',
        approach: 'Começa com as mãos fazendo ou embalando, mostrando quem está por trás.',
        shot: T({ role: 'gancho', duration: 4, audio: 'som', title: () => 'Mãos no trabalho', instruction: () => 'De perto, as mãos preparando, embalando ou montando o produto.' }),
      },
    ],
    body: [
      T({ role: 'produto', duration: 3, audio: 'silencio', title: (c) => `${cap(c.subject)} em detalhe`, instruction: (c) => `Dois ou três closes ${c.s.do} ${c.subject}, cada um de um ângulo.` }),
      T({ role: 'demonstracao', duration: 4, audio: 'fala', title: () => 'Como resolve', instruction: () => 'Mostra o produto ou serviço resolvendo o problema do gancho.', line: () => 'Uma frase dizendo como resolve.' }),
      T({ role: 'prova', duration: 3, audio: 'fala', title: () => 'Prova real', instruction: () => 'Cliente usando, resultado ou número real que você pode comprovar.', tip: 'Só o que dá pra provar. Depoimento real vale mais.' }),
      T({ role: 'contexto', duration: 2, audio: 'som', title: () => 'Lugar e equipe', instruction: () => 'Plano aberto da loja ou do espaço, com movimento natural.' }),
    ],
    ending: T({ role: 'chamada', duration: 3, audio: 'fala', title: () => 'Chamada para ação', instruction: () => 'Você olhando pra câmera com a oferta, do jeito que está no briefing.', line: (c) => (c.price ? `${cap(c.subject)} por ${c.price}. Link na bio.` : 'Diz a oferta e onde encontrar.'), tip: 'Uma ação só: comprar, chamar ou visitar. Não as três.' }),
  },

  opiniao: {
    recordTip: 'Enquadramento do peito pra cima, fundo neutro. Se citar dado, deixa espaço na tela pra fonte.',
    hooks: [
      {
        key: 'pergunta', kind: 'fala', title: () => 'Abrir com a pergunta central',
        approach: 'Abre com a pergunta que o vídeo responde, direto pra câmera.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'A pergunta do vídeo', instruction: () => 'Olhando pra lente, sem introdução.', line: (c) => `O que muda com ${o(c)} pra você?`, tip: 'Sem "oi, gente". Começa pela pergunta.' }),
      },
      {
        key: 'fato', kind: 'fala', title: () => 'Abrir com o fato',
        approach: 'Abre com o fato mais concreto do briefing, com a fonte na tela.',
        shot: T({ role: 'gancho', duration: 4, audio: 'fala', title: () => 'O fato principal', instruction: () => 'Você falando o fato, com espaço em cima ou embaixo para a fonte aparecer.', line: () => 'O fato principal do briefing, com a fonte.', tip: 'Fala o dado exatamente como está na fonte.' }),
      },
      {
        key: 'documento', kind: 'visual', title: () => 'Abrir pelo documento',
        approach: 'Começa mostrando a manchete, o documento ou o gráfico na tela.',
        shot: T({ role: 'gancho', duration: 3, audio: 'silencio', title: () => 'Manchete ou documento', instruction: () => 'Grava a tela ou o papel com a notícia ou o documento original, com a data visível.' }),
      },
    ],
    body: [
      T({ role: 'contexto', duration: 5, audio: 'fala', title: () => 'O que aconteceu', instruction: () => 'Explica o contexto em linguagem simples, como se fosse pra um amigo.', line: () => 'O que aconteceu, só os fatos.' }),
      T({ role: 'prova', duration: 3, audio: 'silencio', title: () => 'Fonte na tela', instruction: () => 'Print ou foto da fonte (site, documento, vídeo oficial) com data.', tip: 'Fonte com data. É isso que dá credibilidade.' }),
      T({ role: 'argumento', duration: 5, audio: 'fala', title: () => 'Quem é afetado', instruction: () => 'Explica quem é afetado e como, com um exemplo concreto.', line: () => 'Um exemplo real de quem é afetado.' }),
      T({ role: 'argumento', duration: 5, audio: 'fala', title: () => 'O outro lado', instruction: () => 'Apresenta o argumento de quem pensa diferente, de forma justa.', line: () => 'O melhor argumento do outro lado.', tip: 'Mostrar o outro lado deixa a sua opinião mais forte.' }),
    ],
    ending: T({ role: 'fechamento', duration: 5, audio: 'reacao', title: () => 'Sua opinião', instruction: () => 'Agora sim a sua opinião, deixando claro que é opinião.', tip: 'Começa com "na minha opinião". Separa do que é fato.' }),
  },

  tutorial: {
    recordTip: 'Mostra a tela ou as mãos de perto. Um passo por tomada, sem pressa.',
    hooks: [
      {
        key: 'resultado', kind: 'visual', title: () => 'Abrir com o resultado',
        approach: 'Mostra o resultado pronto primeiro. A pessoa fica pra saber como chegar lá.',
        shot: T({ role: 'gancho', duration: 3, audio: 'silencio', title: () => 'Resultado pronto', instruction: (c) => `Mostra ${o(c)} ${c.s.pronto}, funcionando, em close.` }),
      },
      {
        key: 'promessa', kind: 'fala', title: () => 'Prometer em uma frase',
        approach: 'Abre falando em quanto tempo ou em quantos passos a pessoa aprende.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'A promessa', instruction: () => 'Rosto pra câmera, uma frase.', line: (c) => `Em três passos você aprende ${c.subject}.`, tip: 'Só promete o que o vídeo mostra.' }),
      },
      {
        key: 'erro', kind: 'fala', title: () => 'Abrir pelo erro comum',
        approach: 'Abre mostrando o erro que quase todo mundo comete.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'O erro comum', instruction: () => 'Mostra o jeito errado acontecendo.', line: () => 'Se você faz assim, está errando.' }),
      },
    ],
    body: [
      T({ role: 'passo', duration: 5, audio: 'fala', title: () => 'Passo 1', instruction: () => 'Primeiro passo de perto, devagar, com as mãos ou a tela bem visíveis.', line: () => 'Explica o passo 1 com as suas palavras.' }),
      T({ role: 'passo', duration: 5, audio: 'fala', title: () => 'Passo 2', instruction: () => 'Segundo passo, mesmo enquadramento do primeiro.', line: () => 'Explica o passo 2.' }),
      T({ role: 'passo', duration: 5, audio: 'fala', title: () => 'Passo 3', instruction: () => 'Terceiro passo, mesmo enquadramento.', line: () => 'Explica o passo 3.' }),
      T({ role: 'detalhe', duration: 3, audio: 'fala', title: () => 'O detalhe que faz diferença', instruction: () => 'Close no ponto onde as pessoas costumam travar.', tip: 'Esse detalhe é o que a pessoa salva o vídeo pra lembrar.' }),
    ],
    ending: T({ role: 'resultado', duration: 3, audio: 'fala', title: () => 'Resultado e próximo passo', instruction: () => 'Resultado final e uma frase do que fazer agora.', line: () => 'O que a pessoa faz agora.' }),
  },

  vlog: {
    recordTip: 'Grava tudo um pouco mais longo do que precisa. Planos de passagem de 2 segundos salvam a edição.',
    hooks: [
      {
        key: 'lugar', kind: 'visual', title: () => 'Abrir pelo lugar',
        approach: 'Abre com o plano mais bonito do dia, sem fala.',
        shot: T({ role: 'gancho', duration: 3, audio: 'som', title: () => 'O plano mais bonito', instruction: (c) => `O lugar mais bonito do dia${c.place ? ` em ${c.place}` : ''}, câmera parada ou andando devagar.` }),
      },
      {
        key: 'convite', kind: 'fala', title: () => 'Abrir te convidando',
        approach: 'Abre com você falando pra câmera onde está e o que vai fazer.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'Selfie do começo', instruction: () => 'Câmera na mão, selfie andando.', line: (c) => (c.place ? `Hoje o dia é em ${c.place}.` : 'Vem comigo nesse dia.'), tip: 'Braço esticado, celular um pouco acima dos olhos.' }),
      },
    ],
    body: [
      T({ role: 'contexto', duration: 2, audio: 'som', title: () => 'Primeiro momento', instruction: () => 'O começo do dia em planos curtos: café, rua, transporte.' }),
      T({ role: 'demonstracao', duration: 3, audio: 'som', title: () => 'O momento principal', instruction: () => 'O momento mais importante do dia, com o som do lugar.' }),
      T({ role: 'reacao', duration: 4, audio: 'reacao', title: () => 'Fala sincera', instruction: () => 'Para e fala pra câmera o que está sentindo agora.', tip: 'Fala do jeito que sair. Pode ser curto.' }),
      T({ role: 'detalhe', duration: 2, audio: 'som', title: () => 'Detalhes do dia', instruction: () => 'Três ou quatro detalhes de 1 segundo: mãos, comida, céu, chão.' }),
      T({ role: 'contexto', duration: 2, audio: 'som', title: () => 'Passagem', instruction: () => 'Plano de passagem andando, pra ligar um momento no outro.' }),
    ],
    ending: T({ role: 'fechamento', duration: 3, audio: 'som', title: () => 'Fim do dia', instruction: () => 'O último plano do dia: pôr do sol, volta pra casa ou luz apagando.' }),
  },

  fitness: {
    recordTip: 'Celular de lado e na altura do quadril, corpo inteiro no quadro. Execução completa, sem cortar no meio.',
    hooks: [
      {
        key: 'execucao', kind: 'visual', title: () => 'Abrir já executando',
        approach: 'Abre no meio do exercício mais forte, sem introdução.',
        shot: T({ role: 'gancho', duration: 3, audio: 'som', title: () => 'Exercício mais forte', instruction: () => 'Corpo inteiro de lado, executando o exercício mais difícil do treino.', tip: 'Começa a gravar antes de começar a repetição.' }),
      },
      {
        key: 'desafio', kind: 'fala', title: () => 'Abrir com um desafio',
        approach: 'Abre falando pra câmera o desafio do treino.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'O desafio', instruction: () => 'Rosto e tronco, ofegante ou antes de começar.', line: (c) => `${cap(c.subject)} que dá pra fazer hoje.` }),
      },
    ],
    body: [
      T({ role: 'passo', duration: 5, audio: 'fala', title: () => 'Exercício 1', instruction: () => 'Execução completa de lado, duas repetições inteiras.', line: () => 'Nome do exercício e quantas repetições.' }),
      T({ role: 'passo', duration: 5, audio: 'fala', title: () => 'Exercício 2', instruction: () => 'Mesmo enquadramento, duas repetições inteiras.', line: () => 'Nome e repetições.' }),
      T({ role: 'detalhe', duration: 3, audio: 'fala', title: () => 'Postura de perto', instruction: () => 'Close no ponto da postura que mais importa (coluna, joelho, ombro).', tip: 'Mostra o certo e o errado lado a lado.' }),
      T({ role: 'passo', duration: 5, audio: 'fala', title: () => 'Exercício 3', instruction: () => 'Mesmo enquadramento, duas repetições inteiras.', line: () => 'Nome e repetições.' }),
    ],
    ending: T({ role: 'fechamento', duration: 3, audio: 'reacao', title: () => 'Fim do treino', instruction: () => 'Você logo depois de terminar, falando como foi.', tip: 'A respiração real vale mais que frase pronta.' }),
  },

  outro: {
    recordTip: 'Segura o celular firme e grava um pouco antes e depois de cada tomada. Eu corto.',
    hooks: [
      {
        key: 'direto', kind: 'fala', title: () => 'Você abrindo direto',
        approach: 'Abre com você olhando pra câmera e dizendo, em uma frase, do que é o vídeo.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'Uma frase pra câmera', instruction: () => 'Rosto em close, olhando pra lente, sem introdução.', line: () => 'Uma frase dizendo do que é o vídeo.', tip: 'Começa a falar já olhando pra lente.' }),
      },
      {
        key: 'imagem', kind: 'visual', title: () => 'Abrir pela imagem mais forte',
        approach: 'Abre com a imagem mais interessante do vídeo, sem fala.',
        shot: T({ role: 'gancho', duration: 3, audio: 'som', title: (c) => `${cap(c.subject)} em destaque`, instruction: (c) => `Close ${c.s.no} ${c.subject}, câmera parada ou se aproximando devagar.` }),
      },
    ],
    body: [
      T({ role: 'contexto', duration: 4, audio: 'fala', title: () => 'Contexto', instruction: () => 'Mostra onde você está e o que está acontecendo.', line: () => 'Explica o contexto em uma ou duas frases.' }),
      T({ role: 'demonstracao', duration: 5, audio: 'fala', title: () => 'O momento principal', instruction: (c) => `Mostra ${o(c)} de perto, o momento que dá sentido ao vídeo.`, line: () => 'Comenta o que está acontecendo.' }),
      T({ role: 'detalhe', duration: 2, audio: 'som', title: () => 'Detalhes', instruction: () => 'Dois ou três closes curtos de detalhes.' }),
      T({ role: 'reacao', duration: 4, audio: 'reacao', title: () => 'Sua reação', instruction: () => 'Fala pra câmera o que achou, na hora.' }),
    ],
    ending: T({ role: 'fechamento', duration: 3, audio: 'reacao', title: () => 'Fechamento', instruction: () => 'Uma frase final sua, olhando pra câmera.', tip: 'Termina seco, sem despedida longa.' }),
  },

  humor: {
    recordTip: 'Câmera parada no tripé ou apoiada. Cada personagem com um detalhe diferente: boné, óculos, voz.',
    hooks: [
      {
        key: 'situacao', kind: 'fala', title: () => 'Abrir já na situação',
        approach: 'Começa no meio da cena, sem explicar. O texto na tela situa.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'Cena começando no meio', instruction: () => 'Personagem 1 já no meio da situação, sem introdução.', line: () => 'A primeira fala do personagem.', tip: 'Começa a gravar e conta 1 segundo antes da fala.' }),
      },
      {
        key: 'pov', kind: 'visual', title: () => 'POV',
        approach: 'Abre em primeira pessoa, a câmera é o espectador.',
        shot: T({ role: 'gancho', duration: 3, audio: 'fala', title: () => 'POV', instruction: () => 'Você falando direto pra lente como se ela fosse a outra pessoa.', line: () => 'A fala de abertura do POV.' }),
      },
    ],
    body: [
      T({ role: 'demonstracao', duration: 3, audio: 'fala', title: () => 'Personagem 2', instruction: () => 'Mesmo enquadramento, outro personagem.', line: () => 'Fala do personagem 2.' }),
      T({ role: 'demonstracao', duration: 3, audio: 'fala', title: () => 'Personagem 3', instruction: () => 'Mesmo enquadramento, outro personagem.', line: () => 'Fala do personagem 3.' }),
      T({ role: 'reacao', duration: 2, audio: 'reacao', title: () => 'Reação', instruction: () => 'Close na reação, olhando pra câmera.', tip: 'Segura a reação um segundo a mais. O corte faz a graça.' }),
      T({ role: 'demonstracao', duration: 3, audio: 'fala', title: () => 'Personagem 4', instruction: () => 'Mesmo enquadramento, outro personagem.', line: () => 'Fala do personagem 4.' }),
    ],
    ending: T({ role: 'fechamento', duration: 3, audio: 'fala', title: () => 'A virada', instruction: () => 'A virada final, a cena que ninguém espera.', line: () => 'A fala da virada.', tip: 'Termina seco, logo depois da virada.' }),
  },
};

/** Assunto com artigo: "o fone bluetooth". */
const o = (c: ShotCtx) => `${c.s.o} ${c.subject}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
