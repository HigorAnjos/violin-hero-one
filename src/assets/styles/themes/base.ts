import type { Theme } from './types';

/** Estrutura igual em todos os temas do catálogo: só a cor muda. */
export const base = {
  fonts: {
    // A face Fallback (fonts.css) ocupa o espaço da real enquanto o woff2 não chega ou se ele falhar
    display: "'Baloo 2', 'Baloo 2 Fallback', system-ui, sans-serif",
    ui: "'Nunito', 'Nunito Fallback', system-ui, sans-serif",
    music: "'Noto Music', serif",
  },
  spacing: {
    xxs: '0.25rem',
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  borderRadius: {
    // 12px = --radius-sm e --radius-note do design; 14px e 18px são os cartões e botões das telas
    sm: '0.75rem',
    md: '0.875rem',
    lg: '1.125rem',
    pill: '999px',
  },
} satisfies Pick<Theme, 'fonts' | 'spacing' | 'borderRadius'>;
