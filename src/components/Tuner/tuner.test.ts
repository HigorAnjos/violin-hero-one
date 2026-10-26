import { describe, it, expect } from 'vitest';
import { midiToFrequency } from '../../game/notation/violin';
import type { PitchReading } from '../../game/audio/types';
import { judgeCents } from '../../game/engine';
import { levelSettings } from '../../game/engine';
import {
  advanceTuner,
  CLOSE_CENTS,
  GOOD_CENTS,
  initialTuner,
  needlePercent,
  TUNED_CENTS,
  tuneHint,
  tuneWord,
  tuningBands,
  type TunerState,
} from './tuner';

const at = (midi: number, cents: number, time: number, a4 = 442, clarity = 0.95): PitchReading => ({
  time,
  hz: midiToFrequency(midi, a4) * 2 ** (cents / 1200),
  midi,
  cents,
  clarity,
  level: -20,
});

function hold(state: TunerState, midi: number, cents: number, from: number, seconds: number, a4 = 442): TunerState {
  let s = state;
  for (let t = from; t <= from + seconds; t += 0.01) s = advanceTuner(s, at(midi, cents, t, a4), a4);
  return s;
}

describe('advanceTuner', () => {
  it('mostra a corda solta mais perto e o desvio ao vivo', () => {
    const s = advanceTuner(initialTuner(), at(69, 22, 0), 442);
    expect(s.live).toEqual({ string: 2, cents: expect.closeTo(22, 3), hz: expect.any(Number) });
    expect(tuneWord(s.live!.cents)).toBe('ALTO');
    expect(tuneHint(s)).toBe('Afrouxe um pouco o microafinador');
  });

  it('afinada por 1 s ganha o ✓ com o desvio médio', () => {
    const s = hold(initialTuner(), 55, -2, 0, 1.05);
    expect(s.tuned).toEqual([-2, null, null, null]);
    expect(tuneHint(s)).toBe('Pronto. Próxima corda: Ré (D)');
  });

  it('o Lá de referência muda o alvo: 440 tocado em 442 é baixo', () => {
    const s = advanceTuner(initialTuner(), at(69, 0, 0, 440), 442);
    expect(s.live!.cents).toBeCloseTo(-7.85, 1);
  });

  it('desafinar no meio recomeça a contagem; nota com dedo não conta', () => {
    let s = hold(initialTuner(), 62, 0, 0, 0.6);
    s = advanceTuner(s, at(62, 40, 0.7), 442);
    s = hold(s, 62, 0, 0.8, 0.6);
    expect(s.tuned[1]).toBeNull();
    expect(advanceTuner(s, at(64, 0, 2), 442).live).toBeNull();
  });

  it('silêncio apaga o ao vivo e lembra a próxima corda', () => {
    const s = advanceTuner(advanceTuner(initialTuner(), at(69, 0, 0), 442), null, 442);
    expect(s.live).toBeNull();
    expect(tuneHint(s)).toBe('Toque a corda Sol (G) solta.');
  });

  it('agulha presa na régua de ±50 ¢', () => {
    expect(needlePercent(4)).toBe(54);
    expect(needlePercent(-90)).toBe(0);
  });

  it('as faixas da legenda são as do motor: o que ela chama de Perfeito o motor julga Perfeito', () => {
    expect([TUNED_CENTS, CLOSE_CENTS, GOOD_CENTS]).toEqual([20, 35, 50]);
    expect(judgeCents(TUNED_CENTS)).toBe('perfect');
    expect(judgeCents(TUNED_CENTS + 1)).toBe('great');
    expect(judgeCents(CLOSE_CENTS)).toBe('great');
    expect(judgeCents(CLOSE_CENTS + 1)).toBe('good');
    expect(tuneWord(18)).toBe('AFINADO');
  });

  it('as faixas seguem a tolerância do nível: o "nunca toquei" chama de afinado o que o motor dele julga Perfeito', () => {
    const bands = tuningBands(levelSettings('never').toleranceCents);
    expect(bands).toEqual({ perfect: 24, great: 42, good: 60 });
    expect(judgeCents(bands.perfect, 60)).toBe('perfect');
    expect(tuneWord(23, bands)).toBe('AFINADO');
    expect(tuneWord(23)).toBe('ALTO');
    expect(needlePercent(60, bands)).toBe(100);
    expect(needlePercent(30, bands)).toBe(75);
  });

  it('com a faixa do nível, a corda segura a 22 ¢ ganha o ✓', () => {
    const bands = tuningBands(60);
    let s = initialTuner();
    for (let t = 0; t <= 1.05; t += 0.01) s = advanceTuner(s, at(55, 22, t), 442, bands);
    expect(s.tuned[0]).toBe(22);
  });
});
