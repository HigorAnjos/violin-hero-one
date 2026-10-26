import { buildTheme } from './build';
import type { Palette } from './types';

/** Palco: o neon escuro do protótipo, de volta como opção. */
export const PALCO: Palette = {
  id: 'palco',
  name: 'Palco',
  tagline: 'Luzes apagadas, neon aceso: hora do show',
  mode: 'dark',
  background: '#1a1024',
  surface: '#24182f',
  surfaceHover: '#2f2140',
  surfaceBorder: '#45325e',
  text: '#f2eaf7',
  textMuted: '#b9a8cc',
  primary: '#ff4fa3',
  danger: '#e5484d',
  warning: '#e0a33a',
  success: '#4cc38a',
  track: '#120a1a',
  trackLine: '#2f2140',
  hitLine: '#f2eaf7',
  strings: { G: '#a78bfa', D: '#ff4fa3', A: '#22d3ee', E: '#ffe066' },
  judgments: { perfect: '#ffffff', great: '#22d3ee', good: '#ffe066', miss: '#ff6b6b' },
  art: { wood: '#c9773d', ebony: '#120a1a', halo: '#2f2140' },
};

export const palcoTheme = buildTheme(PALCO);
