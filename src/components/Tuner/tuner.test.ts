import { describe, it, expect } from 'vitest';
import { midiToFrequency } from '../../game/notation/violin';
import type { PitchReading } from '../../game/audio/types';
import { advanceTuner, initialTuner, needlePercent, tuneHint, tuneWord, type TunerState } from './tuner';

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
});
