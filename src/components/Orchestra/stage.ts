import type { OrchestraSection } from '../../assets/styles/themes/types';

/** 0 = nenhum naipe … 4 = orquestra completa (mesma escala do synth). */
export type OrchestraLevel = 0 | 1 | 2 | 3 | 4;

/** Ordem de entrada dos naipes: cordas, madeiras, metais e, cheia, a percussão. */
export const SECTION_ORDER: readonly OrchestraSection[] = ['strings', 'woodwinds', 'brass', 'percussion'];

export const SECTION_LABEL: Record<OrchestraSection, string> = {
  strings: 'Cordas',
  woodwinds: 'Madeiras',
  brass: 'Metais',
  percussion: 'Percussão',
};

export const LEVEL_LABEL: Record<OrchestraLevel, string> = {
  0: 'nenhum naipe',
  1: 'cordas',
  2: 'cordas e madeiras',
  3: 'cordas, madeiras e metais',
  4: 'orquestra completa',
};

export interface Seat {
  x: number;
  y: number;
}

export interface SectionRow {
  section: OrchestraSection;
  /** Cabeça do músico. */
  head: number;
  seats: Seat[];
  /** Assentos com nota flutuando em cima quando o naipe toca. */
  notes: Seat[];
}

/**
 * Fileiras em arco, medidas do Orchestra.dc.html (viewBox 1280×330): cada naipe senta numa elipse
 * entre dois degraus do palco, do centro para fora.
 */
const ROWS: { section: OrchestraSection; seats: number; a: number; b: number; cy: number; edge: number; head: number }[] = [
  { section: 'strings', seats: 16, a: 247, b: 105.4, cy: 312.4, edge: 12.2, head: 7 },
  { section: 'woodwinds', seats: 13, a: 357.4, b: 148.8, cy: 310, edge: 14.8, head: 6.3 },
  { section: 'brass', seats: 12, a: 461, b: 188.2, cy: 305.2, edge: 17.7, head: 5.7 },
  { section: 'percussion', seats: 7, a: 562, b: 228, cy: 300.4, edge: 27.5, head: 5.2 },
];

export const CENTER_X = 640;

const round = (v: number) => Math.round(v * 10) / 10;

export function stageRows(): SectionRow[] {
  return ROWS.map(({ section, seats, a, b, cy, edge, head }) => {
    const from = (edge * Math.PI) / 180;
    const step = (Math.PI - 2 * from) / (seats - 1);
    const placed = Array.from({ length: seats }, (_, i) => {
      const angle = from + i * step;
      return { x: round(CENTER_X + a * Math.cos(angle)), y: round(cy - b * Math.sin(angle)) };
    });
    const picks = [1, 3, seats - 4, seats - 2];
    return { section, head, seats: placed, notes: picks.map((i) => ({ x: placed[i].x - 10, y: placed[i].y - 40 })) };
  });
}

/** Naipe aceso no nível dado (o 1º entra no nível 1). */
export function isLit(level: OrchestraLevel, section: OrchestraSection): boolean {
  return SECTION_ORDER.indexOf(section) < level;
}

export function orchestraLabel(level: OrchestraLevel): string {
  return `Orquestra ao fundo tocando junto: ${LEVEL_LABEL[level]}`;
}
