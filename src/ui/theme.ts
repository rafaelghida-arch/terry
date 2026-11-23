export const C = {
  bg: '#000000',
  surface: '#111113',
  surface2: '#1B1B1E',
  surface3: '#26262A',
  border: '#2C2C31',
  text: '#FFFFFF',
  dim: '#B4B4BC',
  mute: '#75757F',
  accent: '#1FE0F0', // único acento: seleção, progresso, ações principais
  accentInk: '#001417',
  danger: '#FF5A5F',
  rec: '#FF3B30', // só no botão de gravação
};

export const R = { s: 6, m: 10, l: 14, xl: 20 };

export const T = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: C.text, letterSpacing: -0.4 },
  h2: { fontSize: 19, fontWeight: '700' as const, color: C.text },
  h3: { fontSize: 15, fontWeight: '700' as const, color: C.text },
  body: { fontSize: 15, color: C.text, lineHeight: 21 },
  small: { fontSize: 13, color: C.dim, lineHeight: 18 },
  tiny: { fontSize: 11, color: C.mute, fontWeight: '600' as const, letterSpacing: 0.3 },
};
