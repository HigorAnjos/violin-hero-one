import { HIGHEST_STEP, LOWEST_STEP } from '../../game/notation/editor';

/**
 * Medidas da pauta do editor (ScoreEditor.dc): 848 de largura, sistemas de 4 compassos, linhas de 12 em 12 (6 por
 * grau), a linha de cima em y 44 de cada sistema e o dedo numa bolinha abaixo. Tudo em unidades do viewBox.
 */
export const STAFF_WIDTH = 848;
export const SYSTEM_HEIGHT = 168;
export const MEASURES_PER_SYSTEM = 4;
export const TOP_LINE_Y = 44;
export const STEP_PX = 6;
export const FINGER_Y = 142;
/** Grau da linha de cima (Fá5); a de baixo é o Mi4 (30). */
const TOP_STEP = 38;
/** Da barra até a primeira cabeça, e o que sobra antes da barra seguinte. */
const MEASURE_LEAD = 18;
const MEASURE_TAIL = 12;

export const systemCount = (measures: number) => Math.max(1, Math.ceil(measures / MEASURES_PER_SYSTEM));
export const staffHeight = (measures: number) => systemCount(measures) * SYSTEM_HEIGHT;

/** Clave, armadura e (no primeiro sistema) a fórmula de compasso antes do primeiro compasso. */
export function prefixWidth(system: number, fifths: number): number {
  return 46 + Math.abs(fifths) * 12 + (system === 0 ? 34 : 8);
}

export interface MeasureBox {
  system: number;
  x: number;
  width: number;
}

export function measureBox(measure: number, fifths: number): MeasureBox {
  const system = Math.floor(measure / MEASURES_PER_SYSTEM);
  const prefix = prefixWidth(system, fifths);
  const width = (STAFF_WIDTH - prefix) / MEASURES_PER_SYSTEM;
  return { system, x: prefix + (measure % MEASURES_PER_SYSTEM) * width, width };
}

export const systemTop = (system: number) => system * SYSTEM_HEIGHT;

export function stepY(step: number, system: number): number {
  return systemTop(system) + TOP_LINE_Y + (TOP_STEP - step) * STEP_PX;
}

/** Onde fica na pauta o tempo `at` (semínimas desde o começo): proporcional dentro do compasso. */
export function xAt(at: number, barQuarters: number, fifths: number): { x: number; system: number } {
  const measure = Math.floor(at / barQuarters + 1e-6);
  const box = measureBox(measure, fifths);
  const local = at - measure * barQuarters;
  return { x: box.x + MEASURE_LEAD + (local / barQuarters) * (box.width - MEASURE_LEAD - MEASURE_TAIL), system: box.system };
}

/** Do toque (em unidades do viewBox) ao tempo e ao grau: o compasso sob o dedo e o grau mais perto, dentro do violino. */
export function hitTest(x: number, y: number, measures: number, barQuarters: number, fifths: number): { at: number; step: number } {
  const system = Math.min(systemCount(measures) - 1, Math.max(0, Math.floor(y / SYSTEM_HEIGHT)));
  const first = system * MEASURES_PER_SYSTEM;
  const prefix = prefixWidth(system, fifths);
  const width = (STAFF_WIDTH - prefix) / MEASURES_PER_SYSTEM;
  const slot = Math.min(MEASURES_PER_SYSTEM - 1, Math.max(0, Math.floor((x - prefix) / width)));
  const measure = Math.min(measures - 1, first + slot);
  const box = measureBox(measure, fifths);
  const usable = box.width - MEASURE_LEAD - MEASURE_TAIL;
  // Meia figura para trás: o toque logo antes da cabeça ainda é dela
  const local = Math.min(barQuarters - 1e-6, Math.max(0, ((x - box.x - MEASURE_LEAD + 6) / usable) * barQuarters));
  const step = Math.round(TOP_STEP - (y - systemTop(system) - TOP_LINE_Y) / STEP_PX);
  return { at: measure * barQuarters + local, step: Math.min(HIGHEST_STEP, Math.max(LOWEST_STEP, step)) };
}
