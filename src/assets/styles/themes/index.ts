import { buildTheme } from './build';
import { cadernoTheme } from './caderno';
import { OMARCHY_PALETTES } from './omarchy';
import { palcoTheme } from './palco';
import { neonTheme, pixelTheme } from './specials';
import type { Theme } from './types';

export type { Theme, StringName, Judgment } from './types';
export { cadernoTheme } from './caderno';

/** Catálogo: o Caderno (padrão) e o Palco primeiro, depois as paletas do Omarchy. Aqui "cor muda, estrutura nunca". */
export const THEMES: Theme[] = [
  cadernoTheme,
  palcoTheme,
  ...OMARCHY_PALETTES.filter((p) => p.mode === 'light').map(buildTheme),
  ...OMARCHY_PALETTES.filter((p) => p.mode === 'dark').map(buildTheme),
];

/** Temas que mudam estrutura também (8-Bits, Neon). Seção própria no seletor. */
export const SPECIAL_THEMES: Theme[] = [pixelTheme, neonTheme];

export const DEFAULT_THEME = cadernoTheme;

const byId = new Map([...THEMES, ...SPECIAL_THEMES].map((t) => [t.id, t]));

/** Tema pelo id; id desconhecido (ou lixo no armazenamento) cai no Caderno. */
export function getTheme(id: string | null | undefined): Theme {
  return (id && byId.get(id)) || DEFAULT_THEME;
}

/** Chave da escolha no aparelho (o tema é pessoal e local). */
export const THEME_STORAGE_KEY = 'vh:theme';
