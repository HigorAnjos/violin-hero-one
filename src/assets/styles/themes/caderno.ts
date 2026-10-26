import { buildTheme } from './build';
import type { Palette } from './types';

/** Caderno de música: papel creme, tinta azul-marinho. Cores de design/ds/violinhero/tokens.css. */
export const CADERNO: Palette = {
  id: 'caderno',
  name: 'Caderno de música',
  tagline: 'Papel pautado e tinta azul, como na aula',
  mode: 'light',
  background: '#fbf6ea',
  surface: '#ffffff',
  surfaceHover: '#f4ecda',
  surfaceBorder: '#e3d8bf',
  text: '#1f2a44',
  textMuted: '#5b6478',
  // Magenta do .ns-btn--primary; o buildTheme escurece o mínimo para o texto branco passar AA
  primary: '#d63a8a',
  danger: '#d93636',
  warning: '#b87800',
  success: '#2f8a4c',
  track: '#f4ecda',
  trackLine: '#e3d8bf',
  hitLine: '#1f2a44',
  strings: { G: '#6b4bd8', D: '#d63a8a', A: '#0b8fa8', E: '#b87800' },
  judgments: { perfect: '#1f2a44', great: '#0b8fa8', good: '#b87800', miss: '#d93636' },
  art: { wood: '#d98a4e', ebony: '#2b2438', halo: '#fde7c8' },
};

export const cadernoTheme = buildTheme(CADERNO);
