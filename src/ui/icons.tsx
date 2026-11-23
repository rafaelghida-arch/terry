// Ícones próprios do TERRY: traço 2px, cantos arredondados, desenho mínimo.
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from './theme';

type P = { size?: number; color?: string; fill?: string };
const S = ({ size = 22, children }: { size?: number; children: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {children}
  </Svg>
);
const st = (color = C.text) => ({ stroke: color, strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const Icon = {
  Plus: ({ size, color }: P) => (
    <S size={size}><Path d="M12 5v14M5 12h14" {...st(color)} /></S>
  ),
  Back: ({ size, color }: P) => (
    <S size={size}><Path d="M15 5l-7 7 7 7" {...st(color)} /></S>
  ),
  Close: ({ size, color }: P) => (
    <S size={size}><Path d="M6 6l12 12M18 6L6 18" {...st(color)} /></S>
  ),
  Check: ({ size, color }: P) => (
    <S size={size}><Path d="M5 12.5l4.5 4.5L19 7.5" {...st(color)} /></S>
  ),
  Play: ({ size, color = C.text }: P) => (
    <S size={size}><Path d="M8 5.5v13l10.5-6.5z" fill={color} stroke={color} strokeWidth={1.5} strokeLinejoin="round" /></S>
  ),
  Pause: ({ size, color = C.text }: P) => (
    <S size={size}><Rect x={6.5} y={5} width={3.6} height={14} rx={1} fill={color} /><Rect x={13.9} y={5} width={3.6} height={14} rx={1} fill={color} /></S>
  ),
  Camera: ({ size, color }: P) => (
    <S size={size}><Rect x={3} y={6.5} width={13} height={11} rx={2.5} {...st(color)} /><Path d="M16 10.5l5-3v9l-5-3" {...st(color)} /></S>
  ),
  Gallery: ({ size, color }: P) => (
    <S size={size}><Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} {...st(color)} /><Path d="M3.5 16l5-5 4 4 2.5-2.5 5.5 5" {...st(color)} /><Circle cx={15.5} cy={9} r={1.4} fill={color ?? C.text} /></S>
  ),
  Trim: ({ size, color }: P) => (
    <S size={size}><Path d="M7 4v12a2 2 0 002 2h11" {...st(color)} /><Path d="M4 7h11a2 2 0 012 2v11" {...st(color)} /></S>
  ),
  Frame: ({ size, color }: P) => (
    <S size={size}>
      <Path d="M4 8V5.5A1.5 1.5 0 015.5 4H8M16 4h2.5A1.5 1.5 0 0120 5.5V8M20 16v2.5a1.5 1.5 0 01-1.5 1.5H16M8 20H5.5A1.5 1.5 0 014 18.5V16" {...st(color)} />
      <Rect x={9} y={7} width={6} height={10} rx={1} {...st(color)} />
    </S>
  ),
  Audio: ({ size, color }: P) => (
    <S size={size}><Path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" {...st(color)} /></S>
  ),
  Mic: ({ size, color }: P) => (
    <S size={size}><Rect x={9} y={3.5} width={6} height={11} rx={3} {...st(color)} /><Path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" {...st(color)} /></S>
  ),
  Export: ({ size, color }: P) => (
    <S size={size}><Path d="M12 15V4M7.5 8.5L12 4l4.5 4.5" {...st(color)} /><Path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" {...st(color)} /></S>
  ),
  Share: ({ size, color }: P) => (
    <S size={size}><Circle cx={6.5} cy={12} r={2.5} {...st(color)} /><Circle cx={17.5} cy={6} r={2.5} {...st(color)} /><Circle cx={17.5} cy={18} r={2.5} {...st(color)} /><Path d="M8.7 10.8l6.6-3.6M8.7 13.2l6.6 3.6" {...st(color)} /></S>
  ),
  Download: ({ size, color }: P) => (
    <S size={size}><Path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14" {...st(color)} /></S>
  ),
  Flip: ({ size, color }: P) => (
    <S size={size}><Path d="M4 9a8 8 0 0114-3l2 2M20 15a8 8 0 01-14 3l-2-2" {...st(color)} /><Path d="M20 4v4h-4M4 20v-4h4" {...st(color)} /></S>
  ),
  Refresh: ({ size, color }: P) => (
    <S size={size}><Path d="M19.5 12a7.5 7.5 0 11-2.2-5.3L19.5 9" {...st(color)} /><Path d="M19.5 4.5V9H15" {...st(color)} /></S>
  ),
  Up: ({ size, color }: P) => (
    <S size={size}><Path d="M6 15l6-6 6 6" {...st(color)} /></S>
  ),
  Down: ({ size, color }: P) => (
    <S size={size}><Path d="M6 9l6 6 6-6" {...st(color)} /></S>
  ),
  Trash: ({ size, color }: P) => (
    <S size={size}><Path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 13h9l1-13" {...st(color)} /></S>
  ),
  Edit: ({ size, color }: P) => (
    <S size={size}><Path d="M4 20h4L19 9l-4-4L4 16v4z" {...st(color)} /></S>
  ),
  Swap: ({ size, color }: P) => (
    <S size={size}><Path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" {...st(color)} /></S>
  ),
  Skip: ({ size, color }: P) => (
    <S size={size}><Circle cx={12} cy={12} r={8} {...st(color)} /><Path d="M6.5 17.5l11-11" {...st(color)} /></S>
  ),
  More: ({ size, color = C.text }: P) => (
    <S size={size}><Circle cx={5.5} cy={12} r={1.6} fill={color} /><Circle cx={12} cy={12} r={1.6} fill={color} /><Circle cx={18.5} cy={12} r={1.6} fill={color} /></S>
  ),
  Captions: ({ size, color }: P) => (
    <S size={size}><Rect x={3} y={5} width={18} height={14} rx={3} {...st(color)} /><Path d="M7 12h4M13 12h4M7 15.5h7M16 15.5h1" {...st(color)} /></S>
  ),
  Film: ({ size, color }: P) => (
    <S size={size}><Rect x={4} y={3.5} width={16} height={17} rx={2.5} {...st(color)} /><Path d="M8 3.5v17M16 3.5v17M4 8.5h4M4 15.5h4M16 8.5h4M16 15.5h4" {...st(color)} /></S>
  ),
};

/** Marca do TERRY: visor de câmera com um ponto — o "olho" do amigo que filma junto. */
export function TerryMark({ size = 28, color = C.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect x={1} y={1} width={30} height={30} rx={9} fill={C.surface3} />
      <Path d="M8 12.5V9.5A1.5 1.5 0 019.5 8h3M19.5 8h3A1.5 1.5 0 0124 9.5v3M24 19.5v3a1.5 1.5 0 01-1.5 1.5h-3M12.5 24h-3A1.5 1.5 0 018 22.5v-3" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={16} cy={16} r={3.2} fill={color} />
    </Svg>
  );
}
