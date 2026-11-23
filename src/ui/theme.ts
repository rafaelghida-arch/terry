// Identidade do TERRY: grafite quente, um único acento verde-limão, formas arredondadas
// e uma fonte de título com personalidade (Space Grotesk).
export const C = {
  bg: '#0D0D0F',
  surface: '#17171A',
  surface2: '#1F1F23',
  surface3: '#2A2A2F',
  border: '#2E2E35',
  text: '#F7F7F5',
  dim: '#B9B9B4',
  mute: '#7A7A78',
  accent: '#CBFF4D', // único acento: seleção, progresso, ações principais
  accentInk: '#142100',
  accentSoft: '#1E2A0B',
  danger: '#FF6B5E',
  rec: '#FF453A', // só no botão de gravação
};

export const R = { s: 8, m: 14, l: 18, xl: 26, pill: 999 };

/** Fonte de títulos. Até carregar, o sistema usa a fonte padrão. */
export const F = {
  display: 'SpaceGrotesk_700Bold',
  displayMedium: 'SpaceGrotesk_600SemiBold',
};

export const T = {
  h1: { fontSize: 28, fontFamily: F.display, color: C.text, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontFamily: F.display, color: C.text, letterSpacing: -0.3 },
  h3: { fontSize: 15, fontWeight: '700' as const, color: C.text },
  body: { fontSize: 15, color: C.text, lineHeight: 21 },
  small: { fontSize: 13, color: C.dim, lineHeight: 18 },
  tiny: { fontSize: 11, color: C.mute, fontWeight: '700' as const, letterSpacing: 0.6 },
};
