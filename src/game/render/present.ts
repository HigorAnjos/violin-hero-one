import { JUDGMENTS, JUDGMENT_LABEL } from '../engine/score';
import type { Issue, Judgment } from '../engine/types';

export { JUDGMENTS };

export const FEEDBACK_HOLD_SECONDS = 0.25;
export const FEEDBACK_FADE_SECONDS = 0.35;
const POP_SECONDS = 0.12;
const POP_SCALE = 0.25;

/** Texto grande do julgamento na pista: o nome do motor, com exclamação nos dois melhores ("Perfeito!"). */
export function feedbackLabel(judgment: Judgment): string {
  const label = JUDGMENT_LABEL[judgment];
  return judgment === 'perfect' || judgment === 'great' ? `${label}!` : label;
}

const MINUS = '−';

const signed = (value: number, unit: string) => {
  const n = Math.round(value);
  return ` ${n < 0 ? MINUS : '+'}${Math.abs(n)} ${unit}`;
};
const ms = (v: number | null) => (v === null ? '' : signed(v, 'MS'));
const cents = (v: number | null) => (v === null ? '' : signed(v, '¢'));

export interface JudgmentLike {
  issue: Issue | null;
  offsetMs: number | null;
  cents: number | null;
  state: { combo: number };
}

/**
 * Linha de baixo do feedback: o motivo quando não foi Perfeito, senão o combo. Motivos como no
 * design de erros (GameplayErrors), com a seta que diz para onde corrigir.
 */
export function judgmentDetail(j: JudgmentLike): string {
  switch (j.issue) {
    case null:
      return j.state.combo >= 2 ? `${j.state.combo} seguidas` : '';
    case 'early':
      return `◂ CEDO${ms(j.offsetMs)}`;
    case 'late':
      return `TARDE ▸${ms(j.offsetMs)}`;
    case 'sharp':
      return `ALTO ▴${cents(j.cents)}`;
    case 'flat':
      return `◂ BAIXO${cents(j.cents)}`;
    case 'wrong-note':
      return 'NOTA ERRADA';
    case 'not-played':
      return 'NÃO TOCOU';
  }
}

/** Transparência do feedback mostrado há `age` segundos; 0 é escondido. */
export function feedbackAlpha(age: number): number {
  if (age < 0) return 0;
  if (age <= FEEDBACK_HOLD_SECONDS) return 1;
  return Math.max(0, 1 - (age - FEEDBACK_HOLD_SECONDS) / FEEDBACK_FADE_SECONDS);
}

/** Pulo de tamanho do feedback; com "reduzir movimento" fica parado. */
export function feedbackScale(age: number, reducedMotion: boolean): number {
  if (reducedMotion || age < 0) return 1;
  return 1 + POP_SCALE * Math.max(0, 1 - age / POP_SECONDS);
}

/** Halo do alvo no acerto: cresce e some; com "reduzir movimento" só o alvo cheio, sem halo. */
export function glowRing(age: number, reducedMotion: boolean): { alpha: number; scale: number } {
  const alpha = feedbackAlpha(age);
  if (reducedMotion) return { alpha: 0, scale: 1 };
  return { alpha, scale: 1 + 0.35 * Math.min(1, Math.max(0, age) / (FEEDBACK_HOLD_SECONDS + FEEDBACK_FADE_SECONDS)) };
}

/** Preferência do sistema "reduzir movimento"; fora do navegador, falso. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
