import type { Issue, Judgment, TimingWindows } from './types';

export const JUDGMENTS: readonly Judgment[] = ['perfect', 'great', 'good', 'miss'];
export const JUDGMENT_LABEL: Record<Judgment, string> = { perfect: 'Perfeito', great: 'Ótimo', good: 'Bom', miss: 'Errou' };

export const DEFAULT_WINDOWS: TimingWindows = { perfect: 70, great: 130, good: 220 };
export const DEFAULT_TOLERANCE_CENTS = 50;
/** Frações da tolerância de afinação que ainda dão Perfeito e Ótimo (50 ¢ → 20 ¢ e 35 ¢). */
export const TUNING_PERFECT = 0.4;
export const TUNING_GREAT = 0.7;

export const POINTS: Record<Judgment, number> = { perfect: 100, great: 70, good: 40, miss: 0 };
export const COMBO_STEP = 10;
export const MAX_MULTIPLIER = 4;

const RANK: Record<Judgment, number> = { perfect: 0, great: 1, good: 2, miss: 3 };

export function judgeOffset(offsetMs: number | null, windows: TimingWindows = DEFAULT_WINDOWS): Judgment {
  if (offsetMs === null || !Number.isFinite(offsetMs)) return 'miss';
  const distance = Math.abs(offsetMs);
  if (distance <= windows.perfect) return 'perfect';
  if (distance <= windows.great) return 'great';
  if (distance <= windows.good) return 'good';
  return 'miss';
}

export function judgeCents(cents: number | null, toleranceCents: number = DEFAULT_TOLERANCE_CENTS): Judgment {
  if (cents === null || !Number.isFinite(cents)) return 'miss';
  const distance = Math.abs(cents);
  if (distance <= toleranceCents * TUNING_PERFECT) return 'perfect';
  if (distance <= toleranceCents * TUNING_GREAT) return 'great';
  if (distance <= toleranceCents) return 'good';
  return 'miss';
}

/** O julgamento de um acerto é o pior entre tempo e afinação; o motivo aponta qual dos dois pesou (empate: tempo). */
export function judgeHit(
  offsetMs: number,
  cents: number,
  windows: TimingWindows = DEFAULT_WINDOWS,
  toleranceCents: number = DEFAULT_TOLERANCE_CENTS,
): { judgment: Judgment; issue: Issue | null } {
  const timing = judgeOffset(offsetMs, windows);
  const tuning = judgeCents(cents, toleranceCents);
  const judgment = RANK[tuning] > RANK[timing] ? tuning : timing;
  if (judgment === 'perfect') return { judgment, issue: null };
  if (RANK[tuning] > RANK[timing]) return { judgment, issue: cents > 0 ? 'sharp' : 'flat' };
  return { judgment, issue: offsetMs > 0 ? 'late' : 'early' };
}

/** ×1 nos 10 primeiros acertos seguidos, ×2 a partir do 11º, até ×4. */
export function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP));
}

export interface ScoreState {
  score: number;
  combo: number;
  maxCombo: number;
  multiplier: number;
}

export function initialScore(): ScoreState {
  return { score: 0, combo: 0, maxCombo: 0, multiplier: 1 };
}

/** Acerto soma pontos × multiplicador atual e cresce o combo; erro zera combo e multiplicador. */
export function applyJudgment(state: ScoreState, judgment: Judgment): { state: ScoreState; points: number } {
  if (judgment === 'miss') return { state: { ...state, combo: 0, multiplier: 1 }, points: 0 };
  const points = POINTS[judgment] * state.multiplier;
  const combo = state.combo + 1;
  return {
    state: { score: state.score + points, combo, maxCombo: Math.max(state.maxCombo, combo), multiplier: multiplierFor(combo) },
    points,
  };
}

/** Pontos sem multiplicador sobre os de uma partida toda em Perfeito, em %; 0 sem notas julgadas. */
export function accuracyPercent(counts: Record<Judgment, number>): number {
  let earned = 0;
  let total = 0;
  for (const j of JUDGMENTS) {
    earned += counts[j] * POINTS[j];
    total += counts[j] * POINTS.perfect;
  }
  return total > 0 ? (100 * earned) / total : 0;
}

export function emptyCounts(): Record<Judgment, number> {
  return { perfect: 0, great: 0, good: 0, miss: 0 };
}
