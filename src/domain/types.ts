// Modelo de dados do TERRY. Tudo aqui é serializável em JSON e fica salvo no aparelho.
import type { Genre } from './genres';

export type { Genre };

export type AudioMode = 'fala' | 'narracao' | 'ambiente';
export type TargetDuration = 15 | 30 | 60;

export type ProjectStage = 'brief' | 'references' | 'style' | 'hooks' | 'shoot' | 'edit';

/** Retângulo normalizado (0..1) sobre o quadro já orientado (rotação aplicada). */
export type CropRect = { left: number; top: number; width: number; height: number };

/** Enquadramento escolhido pelo criador: deslocamento -1..1 e zoom >= 1. */
export type Framing = { x: number; y: number; zoom: number };

export type MediaInfo = {
  duration: number; // segundos
  width: number; // já orientado
  height: number;
  hasAudio: boolean;
};

/** Medidas feitas no aparelho, sem IA. */
export type ReferenceMetrics = {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  cuts: number[]; // instantes (s) em que o plano muda
  shotLengths: number[];
  avgShot: number;
  firstShot: number;
  /** Envelope de volume em dBFS, janelas de `audioWindow` segundos. */
  rmsDb: number[];
  zcr: number[];
  audioWindow: number;
  /** Primeiro instante com áudio "falado" provável (estimativa local). */
  voiceOnset: number | null;
  /** Fração do tempo com som presente mas sem fala provável. */
  ambientShare: number;
  /** Fração do tempo em silêncio. */
  silenceShare: number;
  /** Cada plano da referência, com ou sem fala (para o roteiro seguir a mesma estrutura). */
  shots?: { start: number; end: number; voice: boolean }[];
  /** Som contínuo por baixo do vídeo todo (provável trilha). Estimativa. */
  musicLikely?: boolean;
  /** Cores dos quadros (0xRRGGBB reduzidos), para a paleta da legenda. */
  palette?: string[];
};

/** Um plano da estrutura que o roteiro espelha. */
export type StructureBeat = { duration: number; voice: boolean; shot?: string; beat?: string; note?: string };

export type Reference = {
  id: string;
  uri: string; // cópia dentro da pasta do projeto
  name: string;
  thumbUri?: string;
  duration: number;
  width: number;
  height: number;
  metrics?: ReferenceMetrics;
  /** Quadros amostrados (para a IA). */
  frames?: { t: number; uri: string }[];
};

export type ObservationSource = 'ia' | 'medido' | 'demo' | 'criador';

export type Observation = {
  id: string;
  text: string;
  source: ObservationSource;
  enabled: boolean;
  /** Referências que sustentam a observação. */
  referenceIds?: string[];
};

export type OpeningKind = 'comida' | 'preparo' | 'rosto' | 'pergunta' | 'ambiente' | 'fachada';
export type EndingKind = 'veredito' | 'mordida' | 'corte_seco' | 'chamada';

export type StyleFeatures = {
  opening: OpeningKind;
  /** A comida aparece antes de alguém falar? */
  foodBeforeSpeech: boolean | null;
  faceOnCamera: boolean | null;
  avgShot: number;
  pace: 'rapido' | 'medio' | 'lento';
  ambientShare: number;
  voiceOnset: number | null;
  ending: EndingKind;
  talkStyle: 'fala_camera' | 'narracao' | 'sem_fala' | 'misto';
};

export type ReferenceStyle = {
  referenceId: string;
  features: StyleFeatures;
  summary: string;
};

export type StyleAnalysis = {
  source: 'ia' | 'local' | 'demo';
  createdAt: number;
  model?: string;
  perReference: ReferenceStyle[];
  combined: StyleFeatures;
  observations: Observation[];
  divergent: boolean;
  /** Fala do TERRY resumindo o achado mais concreto (ou null se nada concreto). */
  terryLine: string | null;
  /** Ids das referências usadas, para saber quando reaproveitar. */
  referenceIds: string[];
  /** Gênero que as referências mostram (só com IA). */
  genre?: { detected: Genre; perReference: Record<string, Genre> };
  /** Legenda, cor, zoom e trilha das referências. */
  look?: import('./look').RefLook;
  /** Estrutura plano a plano da referência principal (ou da primeira). */
  structure?: StructureBeat[];
  structureByRef?: Record<string, StructureBeat[]>;
};

export type SceneRole =
  | 'gancho'
  | 'preparo'
  | 'escala'
  | 'revelacao'
  | 'detalhe'
  | 'mordida'
  | 'reacao'
  | 'fachada'
  | 'contexto'
  | 'fechamento'
  | 'antes'
  | 'demonstracao'
  | 'passo'
  | 'resultado'
  | 'produto'
  | 'prova'
  | 'argumento'
  | 'chamada';

export type Scene = {
  id: string;
  role: SceneRole;
  /** Título curto do cartão, ex. "Abrir o sanduíche ao meio". */
  title: string;
  /** Instrução concreta de filmagem. */
  instruction: string;
  duration: number; // segundos sugeridos
  /** Orientação de fala ou áudio. */
  audio: string;
  /** Fala sugerida (pode ser vazia para deixar a reação real em aberto). */
  line?: string;
  /** Dica curta do TERRY mostrada na gravação. */
  tip?: string;
  clipId?: string;
};

export type HookOption = {
  id: string;
  title: string;
  approach: string;
  /** Por que esse gancho combina com as referências. */
  why: string;
  scenes: Scene[];
};

export type Clip = {
  id: string;
  uri: string;
  thumbUri?: string;
  origin: 'camera' | 'galeria' | 'demo';
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  trimStart: number;
  trimEnd: number;
  framing: Framing;
  createdAt: number;
  /** Legendas no tempo do arquivo original: acompanham o clipe ao aparar e reordenar. */
  captions?: CaptionCue[];
};

export type CaptionCue = { id: string; start: number; end: number; text: string };

export type CaptionStyle = 'faixa' | 'contorno';

export type CaptionSettings = {
  enabled: boolean;
  style: CaptionStyle;
  position: 'baixo' | 'meio';
  /** Cor do texto (#RRGGBB). Branco ou uma das cores das referências. */
  color?: string;
};

export type ExportRecord = {
  uri: string;
  createdAt: number;
  duration: number;
  savedToGallery?: boolean;
};

export type Project = {
  id: string;
  version: 1;
  title: string;
  createdAt: number;
  updatedAt: number;
  isDemo: boolean;
  stage: ProjectStage;
  brief: string;
  /** Tipo de conteúdo. Projetos antigos não têm: tratados como gastronomia. */
  genre?: Genre;
  targetDuration: TargetDuration;
  audioModes: AudioMode[];
  references: Reference[];
  primaryReferenceId?: string;
  analysis?: StyleAnalysis;
  analysisNote?: string; // aviso exibido quando a IA não está disponível
  hooks?: HookOption[];
  chosenHookId?: string;
  scriptApproved: boolean;
  scenes: Scene[];
  clips: Record<string, Clip>;
  /** Cenas aprovadas para montar sem clipe. */
  skippedSceneIds: string[];
  edit: {
    originalVolume: number; // 0..1
    narrationVolume: number;
    narration?: { uri: string; duration: number };
    zoom?: import('./look').ZoomMode;
    /** Trechos da linha do tempo depois de dividir, mover, duplicar ou excluir. */
    items?: import('./timeline').EditItem[];
    /** O visual das referências já foi aplicado na primeira montagem. */
    lookApplied?: boolean;
    music?: { id: string; title: string; uri: string; volume: number };
  };
  /** Sugestões de publicação geradas na exportação. */
  publish?: import('./publish').PublishIdea;
  captions?: CaptionSettings;
  lastExport?: ExportRecord;
  coverUri?: string;
  selectedSceneId?: string;
};
