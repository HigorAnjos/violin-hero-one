import type { OrchestraSection } from '../../assets/styles/themes/types';

/** Ordem de entrada dos naipes (a mesma da tela Orquestra): cordas, madeiras, metais e, cheia, a percussão. */
export const SECTION_ORDER: readonly OrchestraSection[] = ['strings', 'woodwinds', 'brass', 'percussion'];

/** 0 = nenhum naipe … 4 = orquestra completa. */
export type OrchestraLevel = 0 | 1 | 2 | 3 | 4;

/** Energia acima da qual cordas, madeiras e metais entram; a de início do Motor (0,6) põe os três. */
export const LEVEL_THRESHOLDS: readonly [number, number, number] = [0, 0.25, 0.5];
/** Um naipe só sai com a energia este tanto abaixo de onde entrou: acerto e erro alternados não o fazem piscar. */
export const LEVEL_HYSTERESIS = 0.05;
/** A percussão entra com este combo, por cima dos metais (tela Gameplay: "A percussão entra em 12 acertos seguidos"). */
export const PERCUSSION_COMBO = 12;

export const LEVEL_LABEL: Readonly<Record<OrchestraLevel, string>> = {
  0: 'nenhum naipe',
  1: 'cordas',
  2: 'cordas e madeiras',
  3: 'cordas, madeiras e metais',
  4: 'orquestra completa',
};

/** O que o Motor publica em cada julgamento (EngineState). */
export interface OrchestraDrive {
  /** 0 a 1. */
  energy: number;
  combo: number;
}

/** Nível para a energia e o combo, lembrando o anterior por causa da histerese. Energia zero é silêncio. */
export function levelFor({ energy, combo }: OrchestraDrive, previous?: OrchestraLevel): OrchestraLevel {
  if (!(energy > 0)) return 0;
  let level = 0;
  for (let k = 1; k <= 3; k++) {
    const threshold = LEVEL_THRESHOLDS[k - 1];
    const keep = previous !== undefined && previous >= k && k > 1;
    if (energy > (keep ? threshold - LEVEL_HYSTERESIS : threshold)) level = k;
  }
  if (level === 3 && combo >= PERCUSSION_COMBO) level = 4;
  return level as OrchestraLevel;
}

export function sectionsFor(level: OrchestraLevel): OrchestraSection[] {
  return SECTION_ORDER.slice(0, level);
}
