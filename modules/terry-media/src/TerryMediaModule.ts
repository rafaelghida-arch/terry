import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { AnalyzeOptions, AnalyzeResult, ExportResult, NativeExportSpec, PixelsResult, TerryMediaEvents, TranscribeResult, VideoInfo } from './TerryMedia.types';

declare class TerryMediaModule extends NativeModule<TerryMediaEvents> {
  getVideoInfo(uri: string): Promise<VideoInfo>;
  analyzeVideo(uri: string, options: AnalyzeOptions): Promise<AnalyzeResult>;
  exportComposition(spec: NativeExportSpec): Promise<ExportResult>;
  cancelExport(): void;
  transcribe(uri: string, language: string): Promise<TranscribeResult>;
  framePixels(uri: string, count: number, size: number): Promise<PixelsResult>;
}

/** null quando o app roda sem o development build (ex.: Expo Go). */
export default requireOptionalNativeModule<TerryMediaModule>('TerryMedia');
