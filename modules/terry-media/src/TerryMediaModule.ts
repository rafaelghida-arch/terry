import { NativeModule, requireOptionalNativeModule } from 'expo';
import type { AnalyzeOptions, AnalyzeResult, ExportResult, NativeExportSpec, TerryMediaEvents, VideoInfo } from './TerryMedia.types';

declare class TerryMediaModule extends NativeModule<TerryMediaEvents> {
  getVideoInfo(uri: string): Promise<VideoInfo>;
  analyzeVideo(uri: string, options: AnalyzeOptions): Promise<AnalyzeResult>;
  exportComposition(spec: NativeExportSpec): Promise<ExportResult>;
  cancelExport(): void;
}

/** null quando o app roda sem o development build (ex.: Expo Go). */
export default requireOptionalNativeModule<TerryMediaModule>('TerryMedia');
