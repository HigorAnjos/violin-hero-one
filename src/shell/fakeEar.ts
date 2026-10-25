import type { PitchListener, PitchReading } from '../game/audio/types';
import { DEFAULT_A4, midiToFrequency } from '../game/notation/violin';
import type { Ear, LevelListener } from './Ear';

export interface FakeEar extends Ear {
  pitch(reading: PitchReading | null): void;
  level(dbfs: number): void;
  /** Próximo start() falha com este erro do navegador (uma vez). */
  failNextStart(name: string): void;
  readonly started: number;
}

/** Leitura no contrato do Ouvido para uma nota, com desvio em cents. */
export function reading(midi: number, time: number, cents = 0, level = -20): PitchReading {
  return { time, hz: midiToFrequency(midi + cents / 100, DEFAULT_A4), midi, cents, clarity: 0.95, level };
}

/** Ouvido de mentira: os testes (e a simulação de desenvolvimento) empurram as leituras na mão. */
export function createFakeEar(): FakeEar {
  const pitchListeners = new Set<PitchListener>();
  const levelListeners = new Set<LevelListener>();
  let failure: string | null = null;
  let started = 0;
  return {
    get started() {
      return started;
    },
    async start() {
      if (failure) {
        const name = failure;
        failure = null;
        throw new DOMException('falha simulada', name);
      }
      started += 1;
    },
    stop: () => undefined,
    onPitch(listener) {
      pitchListeners.add(listener);
      return () => pitchListeners.delete(listener);
    },
    onLevel(listener) {
      levelListeners.add(listener);
      return () => levelListeners.delete(listener);
    },
    pitch: (r) => pitchListeners.forEach((l) => l(r)),
    level: (db) => levelListeners.forEach((l) => l(db)),
    failNextStart(name) {
      failure = name;
    },
  };
}
