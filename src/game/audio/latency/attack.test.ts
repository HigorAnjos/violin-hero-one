import { describe, expect, it } from 'vitest';
import { midiToFrequency } from '../../notation/violin';
import { calibrationTake, detectAttacks } from '../testing/calibration-signal';
import { concat, silence, tone } from '../testing/synth';
import { AttackTracker } from './attack';

const clickTimes = [0.5, 1.5, 2.5];

describe('AttackTracker', () => {
  it('informa cada Lá solto no seu início, com a altura', () => {
    const { signal, attackTimes } = calibrationTake({ clickTimes, delayMs: 60, noise: 0.05, leak: 0.5 });
    const attacks = detectAttacks(signal);
    expect(attacks).toHaveLength(3);
    attacks.forEach((a, i) => {
      expect(Math.abs(a.time - (attackTimes[i] as number))).toBeLessThan(0.005);
      expect(a.hz).toBeGreaterThan(437);
      expect(a.hz).toBeLessThan(447);
    });
  });

  it('nunca informa o vazamento do clique sozinho', () => {
    const { signal } = calibrationTake({ clickTimes, delayMs: 0, missed: [0, 1, 2], leak: 1, noise: 0.01 });
    expect(detectAttacks(signal)).toEqual([]);
  });

  it('ignora outras notas, mesmo com energia perto de 442 Hz', () => {
    const notes = [midiToFrequency(62), midiToFrequency(70), midiToFrequency(57)].map((frequency) =>
      concat(silence(0.4), tone({ frequency, durationSec: 0.4, peak: 0.5 })),
    );
    expect(detectAttacks(concat(...notes, silence(0.4)))).toEqual([]);
  });

  it('segue outro Lá de referência', () => {
    const { signal } = calibrationTake({ clickTimes, delayMs: 60, a4: 415, noise: 0.02 });
    expect(detectAttacks(signal, { a4: 442 })).toEqual([]);
    expect(detectAttacks(signal, { a4: 415 })).toHaveLength(3);
  });

  it('marca os ataques no relógio do contexto da primeira amostra', () => {
    const { signal, attackTimes } = calibrationTake({ clickTimes, delayMs: 60 });
    const attacks = detectAttacks(signal, { startAt: 100 });
    expect(Math.abs(attacks[0].time - 100 - (attackTimes[0] as number))).toBeLessThan(0.005);
  });

  it('recusa Lá fora da faixa', () => {
    expect(() => new AttackTracker({ sampleRate: 48000, a4: 300 })).toThrow(RangeError);
  });
});
