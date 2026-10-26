import { describe, expect, it } from 'vitest';
import type { LapSummary } from '../../game/engine';
import { autoSpeed, clampLoop, cleanStreak, lapAdvice, practiceTitle } from './lapRules';

const lap = (accuracy: number, factor = 0.7, complete = true): LapSummary => ({
  lap: 0,
  from: 0,
  to: 2,
  notes: 8,
  counts: { perfect: 0, great: 0, good: 0, miss: 0 },
  accuracy,
  score: 0,
  factors: [factor],
  complete,
});

describe('cleanStreak / autoSpeed', () => {
  it('duas passadas limpas seguidas na mesma velocidade sobem 5%', () => {
    expect(cleanStreak([lap(80), lap(92), lap(95)], 0.7)).toBe(2);
    expect(autoSpeed([lap(80), lap(92), lap(95)], 0.7)).toBe(0.75);
  });

  it('uma passada suja, ou de outra velocidade, zera a sequência', () => {
    expect(autoSpeed([lap(92), lap(85)], 0.7)).toBeNull();
    expect(autoSpeed([lap(95, 0.7), lap(95, 0.75)], 0.75)).toBeNull();
  });

  it('a volta cortada não conta nem quebra; a 100% não sobe mais', () => {
    expect(cleanStreak([lap(95), lap(95), lap(40, 0.7, false)], 0.7)).toBe(2);
    expect(autoSpeed([lap(99, 1), lap(99, 1)], 1)).toBeNull();
    expect(autoSpeed([lap(99, 0.97), lap(99, 0.97)], 0.97)).toBe(1);
  });
});

describe('lapAdvice', () => {
  it('quanto falta, desligado e a 100%', () => {
    expect(lapAdvice([lap(92)], 0.7, true)).toBe('Mais 1 passada acima de 90% e a velocidade sobe para 75%.');
    expect(lapAdvice([], 0.7, true)).toBe('Mais 2 passadas acima de 90% e a velocidade sobe para 75%.');
    expect(lapAdvice([], 0.7, false)).toMatch(/Ligue “Acelerar sozinho”/);
    expect(lapAdvice([], 1, true)).toMatch(/velocidade da música/);
  });
});

describe('practiceTitle', () => {
  it('laço, do compasso ao fim ou a música inteira (compassos a partir de 1)', () => {
    expect(practiceTitle({ startMeasure: 17, endMeasure: 18 }, 17)).toBe('Compassos 18–19 em loop');
    expect(practiceTitle({ startMeasure: 3, endMeasure: 3 }, 3)).toBe('Compasso 4 em loop');
    expect(practiceTitle(null, 4)).toBe('Do compasso 5 ao fim');
    expect(practiceTitle(null, 0)).toBe('A música inteira');
  });
});

describe('clampLoop', () => {
  it('dentro da música, A ≤ B, e quem mexe empurra o outro', () => {
    expect(clampLoop({ startMeasure: -1, endMeasure: 40 }, 16, 'start')).toEqual({ startMeasure: 0, endMeasure: 15 });
    expect(clampLoop({ startMeasure: 5, endMeasure: 4 }, 16, 'start')).toEqual({ startMeasure: 5, endMeasure: 5 });
    expect(clampLoop({ startMeasure: 5, endMeasure: 4 }, 16, 'end')).toEqual({ startMeasure: 4, endMeasure: 4 });
  });
});
