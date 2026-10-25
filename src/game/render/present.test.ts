import { describe, expect, it } from 'vitest';
import { FEEDBACK_LABEL, feedbackAlpha, feedbackScale, glowRing, judgmentDetail, type JudgmentLike } from './present';

const j = (over: Partial<JudgmentLike>): JudgmentLike => ({ issue: null, offsetMs: 0, cents: 0, state: { combo: 0 }, ...over });

describe('judgmentDetail', () => {
  it('Perfeito mostra o combo a partir de 2', () => {
    expect(judgmentDetail(j({ state: { combo: 1 } }))).toBe('');
    expect(judgmentDetail(j({ state: { combo: 128 } }))).toBe('128 seguidas');
  });

  it.each([
    [{ issue: 'late', offsetMs: 84.4 }, 'Tarde +84 ms'],
    [{ issue: 'early', offsetMs: -91.6 }, 'Cedo −92 ms'],
    [{ issue: 'sharp', cents: 38 }, 'Alto +38 ¢'],
    [{ issue: 'flat', cents: -12.2 }, 'Baixo −12 ¢'],
    [{ issue: 'wrong-note' }, 'Nota errada'],
    [{ issue: 'not-played', offsetMs: null, cents: null }, 'Não tocou'],
    [{ issue: 'late', offsetMs: null }, 'Tarde'],
  ] as const)('motivo %o → %s', (over, text) => {
    expect(judgmentDetail(j(over))).toBe(text);
  });
});

describe('feedback', () => {
  it('fica cheio um instante e depois some', () => {
    expect(feedbackAlpha(0)).toBe(1);
    expect(feedbackAlpha(0.2)).toBe(1);
    expect(feedbackAlpha(0.4)).toBeGreaterThan(0);
    expect(feedbackAlpha(0.4)).toBeLessThan(1);
    expect(feedbackAlpha(1)).toBe(0);
    expect(feedbackAlpha(-0.1)).toBe(0);
  });

  it('pula e assenta em 1; parado com reduzir movimento', () => {
    expect(feedbackScale(0, false)).toBeCloseTo(1.25);
    expect(feedbackScale(0.2, false)).toBe(1);
    expect(feedbackScale(0, true)).toBe(1);
  });

  it('halo do alvo só sem reduzir movimento', () => {
    expect(glowRing(0.1, false).alpha).toBe(1);
    expect(glowRing(0.5, false).scale).toBeGreaterThan(1);
    expect(glowRing(0.1, true)).toEqual({ alpha: 0, scale: 1 });
  });

  it('rótulos em português', () => {
    expect(Object.values(FEEDBACK_LABEL)).toEqual(['Perfeito!', 'Ótimo!', 'Bom', 'Errou']);
  });
});
