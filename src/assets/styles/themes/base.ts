import type { Theme } from './types';

/** Estrutura igual em todos os temas do catálogo: só a cor muda. */
export const base = {
  fonts: {
    display: "'Baloo 2', 'Nunito', system-ui, sans-serif",
    ui: "'Nunito', system-ui, sans-serif",
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
    sm: '0.5rem',
    md: '0.75rem',
    lg: '0.875rem',
    pill: '999px',
  },
} satisfies Pick<Theme, 'fonts' | 'spacing' | 'borderRadius'>;
