import { base } from './base';
import { buildTheme } from './build';
import type { Palette, Theme } from './types';

/** Cartucho de 8 bits: fundo de tubo de TV, cores chapadas de console antigo. */
export const PIXEL: Palette = {
  id: '8-bits',
  name: '8-Bits',
  tagline: 'Fase bônus: notas quadradas e cantos retos',
  mode: 'dark',
  background: '#0f0f23',
  surface: '#1d1d3a',
  surfaceHover: '#2a2a52',
  surfaceBorder: '#4a4a8a',
  text: '#fcfcfc',
  textMuted: '#bcbcbc',
  primary: '#fc7460',
  danger: '#f83800',
  warning: '#f8b800',
  success: '#58d854',
  track: '#000000',
  trackLine: '#2a2a52',
  hitLine: '#fcfcfc',
  strings: { G: '#9878f8', D: '#f878f8', A: '#3cbcfc', E: '#f8b800' },
  judgments: { perfect: '#fcfcfc', great: '#3cbcfc', good: '#f8b800', miss: '#f83800' },
  art: { wood: '#c84c0c', ebony: '#000000', halo: '#2a2a52' },
};

/** Neon: o protótipo original, luz acesa nas notas e na pista. */
export const NEON: Palette = {
  id: 'neon',
  name: 'Neon',
  tagline: 'Tudo aceso: as notas brilham na pista',
  mode: 'dark',
  background: '#07060f',
  surface: '#13111f',
  surfaceHover: '#1e1a30',
  surfaceBorder: '#3a2f5c',
  text: '#f4f0ff',
  textMuted: '#b3a9d6',
  primary: '#ff2fa0',
  danger: '#ff4d6d',
  warning: '#ffd23f',
  success: '#3dffa2',
  track: '#05040b',
  trackLine: '#2a2244',
  hitLine: '#f4f0ff',
  strings: { G: '#a26bff', D: '#ff2fa0', A: '#18e6ff', E: '#ffe14d' },
  judgments: { perfect: '#ffffff', great: '#18e6ff', good: '#ffe14d', miss: '#ff4d6d' },
  art: { wood: '#c9773d', ebony: '#05040b', halo: '#2a1f4a' },
};

const pixelFont = "'Pixelify Sans', 'Pixelify Sans Fallback', ui-monospace, monospace";

/**
 * Os especiais mudam estrutura, não só cor: por isso vivem fora de THEMES e têm seção própria no seletor. A cor sai do
 * mesmo buildTheme (AA garantido); a estrutura é a única licença que eles têm.
 */
function special(palette: Palette, kind: NonNullable<Theme['special']>, game: Partial<Theme['game']>, rest: Partial<Theme> = {}): Theme {
  const theme = buildTheme(palette);
  return { ...theme, ...rest, special: kind, game: { ...theme.game, ...game } };
}

export const pixelTheme = special(
  PIXEL,
  'pixel',
  { noteShape: 'square' },
  {
    // Pixel só nos títulos: no texto corrido de 12–13 px o 5 vira S e o "fi" vira A. Partitura continua em Noto Music
    fonts: { display: pixelFont, ui: base.fonts.ui, music: base.fonts.music },
    borderRadius: { sm: '0', md: '0', lg: '0', pill: '0' },
    shadows: { card: '0.25rem 0.25rem 0 #000000' },
  },
);

export const neonTheme = special(NEON, 'neon', { glow: 1 });
