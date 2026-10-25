import { describe, expect, it } from 'vitest';
import {
  JUDGMENT_LABEL,
  accuracyPercent,
  applyJudgment,
  initialScore,
  judgeCents,
  judgeHit,
  judgeOffset,
  multiplierFor,
} from './score';

describe('judgeOffset', () => {
  it.each([
    [0, 'perfect'],
    [70, 'perfect'],
    [-71, 'great'],
    [130, 'great'],
    [131, 'good'],
    [-220, 'good'],
    [221, 'miss'],
    [null, 'miss'],
    [Number.NaN, 'miss'],
  ] as const)('%s ms → %s', (offset, expected) => {
    expect(judgeOffset(offset)).toBe(expected);
  });

  it('aceita janelas próprias', () => {
    expect(judgeOffset(90, { perfect: 100, great: 150, good: 300 })).toBe('perfect');
  });
});

describe('judgeCents', () => {
  it.each([
    [0, 'perfect'],
    [20, 'perfect'],
    [-21, 'great'],
    [35, 'great'],
    [38, 'good'],
    [-50, 'good'],
    [51, 'miss'],
  ] as const)('%s ¢ → %s com a tolerância padrão de 50 ¢', (cents, expected) => {
    expect(judgeCents(cents)).toBe(expected);
  });

  it('as faixas acompanham a tolerância configurada', () => {
    expect(judgeCents(15, 30)).toBe('great');
    expect(judgeCents(31, 30)).toBe('miss');
  });
});

describe('judgeHit', () => {
  it('no tempo e afinado é Perfeito, sem motivo', () => {
    expect(judgeHit(10, -5)).toEqual({ judgment: 'perfect', issue: null });
  });

  it('o pior entre tempo e afinação decide, e o motivo aponta qual', () => {
    expect(judgeHit(84, 2)).toEqual({ judgment: 'great', issue: 'late' });
    expect(judgeHit(-150, 2)).toEqual({ judgment: 'good', issue: 'early' });
    expect(judgeHit(5, 38)).toEqual({ judgment: 'good', issue: 'sharp' });
    expect(judgeHit(5, -25)).toEqual({ judgment: 'great', issue: 'flat' });
    expect(judgeHit(100, 38)).toEqual({ judgment: 'good', issue: 'sharp' });
  });

  it('empate fica com o tempo', () => {
    expect(judgeHit(-100, 30)).toEqual({ judgment: 'great', issue: 'early' });
  });
});

describe('pontos e combo', () => {
  it('rótulos em pt-BR', () => {
    expect(JUDGMENT_LABEL).toEqual({ perfect: 'Perfeito', great: 'Ótimo', good: 'Bom', miss: 'Errou' });
  });

  it('o multiplicador sobe a cada 10 acertos seguidos, até ×4', () => {
    expect([0, 9, 10, 19, 20, 30, 99].map(multiplierFor)).toEqual([1, 1, 2, 2, 3, 4, 4]);
  });

  it('acerto soma pontos × multiplicador; erro zera combo e multiplicador e mantém pontos e combo máximo', () => {
    let state = initialScore();
    for (let i = 0; i < 10; i++) state = applyJudgment(state, 'perfect').state;
    expect(state).toEqual({ score: 1000, combo: 10, maxCombo: 10, multiplier: 2 });
    const great = applyJudgment(state, 'great');
    expect(great.points).toBe(140);
    const miss = applyJudgment(great.state, 'miss');
    expect(miss).toEqual({ state: { score: 1140, combo: 0, maxCombo: 11, multiplier: 1 }, points: 0 });
  });

  it('não altera o estado anterior', () => {
    const state = initialScore();
    applyJudgment(state, 'perfect');
    expect(state).toEqual(initialScore());
  });
});

describe('accuracyPercent', () => {
  it('100 em tudo Perfeito, 0 em tudo Errou, 0 sem notas', () => {
    expect(accuracyPercent({ perfect: 4, great: 0, good: 0, miss: 0 })).toBe(100);
    expect(accuracyPercent({ perfect: 0, great: 0, good: 0, miss: 4 })).toBe(0);
    expect(accuracyPercent({ perfect: 0, great: 0, good: 0, miss: 0 })).toBe(0);
  });

  it('pesa cada julgamento pelos pontos sem multiplicador', () => {
    expect(accuracyPercent({ perfect: 1, great: 1, good: 1, miss: 1 })).toBeCloseTo(52.5, 6);
  });
});
