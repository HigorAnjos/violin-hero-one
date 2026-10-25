import { describe, it, expect } from 'vitest';
import { OPEN_STRING_MIDI } from '../../game/notation/violin';
import { reading } from '../../shell/fakeEar';
import { advanceCheck, formatCents, formatHz, HOLD_SECONDS, initialCheck, isComplete, type OpenStringCheck } from './openStringCheck';

/** Toca `midi` por `seconds`, uma leitura a cada 10 ms, a partir de `from`. */
function play(state: OpenStringCheck, midi: number, seconds: number, from = 0, cents = 0) {
  let s = state;
  for (let t = 0; t <= seconds + 1e-9; t += 0.01) s = advanceCheck(s, reading(midi, from + t, cents));
  return s;
}

describe('advanceCheck', () => {
  it('a corda da vez conta depois de 2 s seguidos e guarda o desvio médio', () => {
    let s = play(initialCheck(), OPEN_STRING_MIDI[0], HOLD_SECONDS - 0.1, 0, -2);
    expect(s.current).toBe(0);
    expect(s.heldSeconds).toBeCloseTo(1.9, 5);
    expect(s.liveCents).toBe(-2);
    s = play(s, OPEN_STRING_MIDI[0], 0.2, 1.91, -2);
    expect(s.current).toBe(1);
    expect(s.results).toEqual([-2, null, null, null]);
    expect(s.liveCents).toBeNull();
  });

  it('parar de tocar ou tocar outra nota zera só a corda da vez', () => {
    let s = play(initialCheck(), OPEN_STRING_MIDI[0], 1);
    s = advanceCheck(s, null);
    expect(s.heldSeconds).toBe(0);
    s = play(s, OPEN_STRING_MIDI[0], 1, 5);
    s = advanceCheck(s, reading(OPEN_STRING_MIDI[0] + 2, 6.01));
    expect(s.heldSeconds).toBe(0);
    expect(s.current).toBe(0);
  });

  it('leitura pouco clara é ignorada, sem somar nem zerar', () => {
    const s = play(initialCheck(), OPEN_STRING_MIDI[0], 1);
    const noisy = advanceCheck(s, { ...reading(40, 1.05), clarity: 0.3 });
    expect(noisy).toBe(s);
  });

  it('buraco longo entre leituras não vira tempo segurando', () => {
    let s = advanceCheck(initialCheck(), reading(OPEN_STRING_MIDI[0], 0));
    s = advanceCheck(s, reading(OPEN_STRING_MIDI[0], 5));
    expect(s.heldSeconds).toBeCloseTo(0.15, 5);
  });

  it('as quatro em ordem completam a checagem; depois disso nada muda', () => {
    let s = initialCheck();
    OPEN_STRING_MIDI.forEach((midi, i) => {
      s = play(s, midi, HOLD_SECONDS + 0.05, i * 3, i);
    });
    expect(isComplete(s)).toBe(true);
    expect(s.results).toEqual([0, 1, 2, 3]);
    expect(advanceCheck(s, reading(55, 99))).toBe(s);
  });
});

describe('formatação', () => {
  it('cents com sinal tipográfico e Hz no padrão brasileiro', () => {
    expect(formatCents(4.4)).toBe('+4 ¢');
    expect(formatCents(-2)).toBe('−2 ¢');
    expect(formatCents(-0.3)).toBe('0 ¢');
    expect(formatHz(196)).toBe('196,0 Hz');
  });
});
