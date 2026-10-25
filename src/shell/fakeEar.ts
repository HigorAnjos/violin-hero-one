import type { PitchListener, PitchReading } from '../game/audio/types';
import { DEFAULT_A4, midiToFrequency } from '../game/notation/violin';
import type { Ear, EarAudio, EarClosedReason, LevelListener } from './Ear';

export interface FakeEar extends Ear {
  pitch(reading: PitchReading | null): void;
  level(dbfs: number): void;
  /** Próximo start() falha com este erro do navegador (uma vez). */
  failNextStart(name: string): void;
  /** O que audio() devolve depois do próximo start() (padrão: nenhum áudio). */
  provideAudio(audio: EarAudio | null): void;
  /** Fecha como o navegador fecharia (aba escondida) ou como um stop(). */
  close(reason: EarClosedReason): void;
  readonly started: number;
  readonly stopped: number;
  readonly a4: number;
  readonly open: boolean;
}

/** Leitura no contrato do Ouvido para uma nota, com desvio em cents. */
export function reading(midi: number, time: number, cents = 0, level = -20): PitchReading {
  return { time, hz: midiToFrequency(midi + cents / 100, DEFAULT_A4), midi, cents, clarity: 0.95, level };
}

/** Ouvido de mentira: os testes (e a simulação de desenvolvimento) empurram as leituras na mão. */
export function createFakeEar(): FakeEar {
  const pitchListeners = new Set<PitchListener>();
  const levelListeners = new Set<LevelListener>();
  const closedListeners = new Set<(reason: EarClosedReason) => void>();
  let failure: string | null = null;
  let started = 0;
  let stopped = 0;
  let a4 = DEFAULT_A4;
  let provided: EarAudio | null = null;
  let current: EarAudio | null = null;
  let running = false;

  const close = (reason: EarClosedReason) => {
    const was = running;
    running = false;
    current = null;
    if (was) closedListeners.forEach((l) => l(reason));
  };

  return {
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    get a4() {
      return a4;
    },
    get open() {
      return running;
    },
    async start() {
      if (failure) {
        const name = failure;
        failure = null;
        throw new DOMException('falha simulada', name);
      }
      started += 1;
      running = true;
      current = provided;
    },
    stop() {
      stopped += 1;
      close('stopped');
    },
    onPitch(listener) {
      pitchListeners.add(listener);
      return () => pitchListeners.delete(listener);
    },
    onLevel(listener) {
      levelListeners.add(listener);
      return () => levelListeners.delete(listener);
    },
    audio: () => current,
    setA4(next) {
      a4 = next;
    },
    onClosed(listener) {
      closedListeners.add(listener);
      return () => closedListeners.delete(listener);
    },
    pitch: (r) => pitchListeners.forEach((l) => l(r)),
    level: (db) => levelListeners.forEach((l) => l(db)),
    failNextStart(name) {
      failure = name;
    },
    provideAudio(audio) {
      provided = audio;
    },
    close,
  };
}
