import { cadernoTheme } from './caderno';
import { palcoTheme } from './palco';
import type { Theme } from './types';

export type { Theme, StringName, Judgment } from './types';
export { cadernoTheme } from './caderno';

/** Catálogo: o Caderno (padrão) primeiro. Aqui "cor muda, estrutura nunca". */
export const THEMES: Theme[] = [cadernoTheme, palcoTheme];

/** Temas que mudam estrutura também (8-Bits, Neon). Seção própria no seletor; chegam depois. */
export const SPECIAL_THEMES: Theme[] = [];

export const DEFAULT_THEME = cadernoTheme;

const byId = new Map([...THEMES, ...SPECIAL_THEMES].map((t) => [t.id, t]));

/** Tema pelo id; id desconhecido (ou lixo no armazenamento) cai no Caderno. */
export function getTheme(id: string | null | undefined): Theme {
  return (id && byId.get(id)) || DEFAULT_THEME;
}

/** Chave da escolha no aparelho (o tema é pessoal e local). */
export const THEME_STORAGE_KEY = 'vh:theme';
