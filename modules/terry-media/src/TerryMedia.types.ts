export type VideoInfo = {
  duration: number;
  /** Já orientado (rotação aplicada). */
  width: number;
  height: number;
  hasAudio: boolean;
};

export type AnalyzeOptions = {
  /** Quadros por segundo amostrados para detectar cortes. */
  sampleFps: number;
  /** Quantos quadros salvar em JPEG para a análise visual. */
  frameCount: number;
  /** Maior lado dos JPEGs salvos. */
  frameMaxSize: number;
  /** Pasta (file://) onde salvar os quadros. */
  outputDir: string;
  /** Janela do envelope de áudio, em segundos. */
  audioWindow: number;
};

export type AnalyzeResult = {
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  /** Diferença média (0..1) entre amostras consecutivas de quadros. */
  diffs: number[];
  diffInterval: number;
  rmsDb: number[];
  zcr: number[];
  audioWindow: number;
  frames: { t: number; uri: string }[];
};

export type NativeCrop = { left: number; top: number; width: number; height: number };

export type NativeExportSpec = {
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  segments: { uri: string; start: number; end: number; crop: NativeCrop; volume: number; hasAudio: boolean }[];
  narration?: { uri: string; volume: number; duration: number };
};

export type ExportResult = { uri: string; duration: number };

export type TerryMediaEvents = {
  onExportProgress: (event: { progress: number }) => void;
};
