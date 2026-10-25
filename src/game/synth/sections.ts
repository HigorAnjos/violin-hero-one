import type { OrchestraSection } from '../../assets/styles/themes/types';

/** Ordem de entrada dos naipes (a mesma da tela Orquestra): cordas, madeiras, metais e, cheia, a percussão. */
export const SECTION_ORDER: readonly OrchestraSection[] = ['strings', 'woodwinds', 'brass', 'percussion'];

/** 0 = nenhum naipe … 4 = orquestra completa. */
export type OrchestraLevel = 0 | 1 | 2 | 3 | 4;

/** Energia acima da qual cada nível 1–4 entra; a de início do motor (0,6) põe três naipes. */
export const LEVEL_THRESHOLDS: readonly [number, number, number, number] = [0, 0.25, 0.5, 0.75];
/** Um naipe só sai com a energia este tanto abaixo de onde entrou: acerto e erro alternados não o fazem piscar. */
export const LEVEL_HYSTERESIS = 0.05;

export const LEVEL_LABEL: Readonly<Record<OrchestraLevel, string>> = {
  0: 'nenhum naipe',
  1: 'cordas',
  2: 'cordas e madeiras',
  3: 'cordas, madeiras e metais',
  4: 'orquestra completa',
};

/** Nível para a energia (0 a 1), lembrando o anterior por causa da histerese. Energia zero é silêncio. */
export function levelFor(energy: number, previous?: OrchestraLevel): OrchestraLevel {
  if (!(energy > 0)) return 0;
  let level = 0;
  for (let k = 1; k <= 4; k++) {
    const threshold = LEVEL_THRESHOLDS[k - 1];
    const keep = previous !== undefined && previous >= k && k > 1;
    if (energy > (keep ? threshold - LEVEL_HYSTERESIS : threshold)) level = k;
  }
  return level as OrchestraLevel;
}

export function sectionsFor(level: OrchestraLevel): OrchestraSection[] {
  return SECTION_ORDER.slice(0, level);
}
