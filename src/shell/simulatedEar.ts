import { renderPerformance, type EngineNote, type TimedReading } from '../game/engine';
import { DEFAULT_A4, OPEN_STRING_MIDI } from '../game/notation/violin';
import type { Ear, EarAudio } from './Ear';
import { createFakeEar, reading } from './fakeEar';

const TICK_MS = 10;
/** Cada corda soa 2,6 s e depois 0,8 s de silêncio: dá para ver o "segurando" e a troca. */
const NOTE_S = 2.6;
const GAP_S = 0.8;

/** Ouvido que sabe tocar a música da partida: a Gameplay entrega as notas no relógio do áudio dele. */
export interface RehearsalEar extends Ear {
  /** `latencySeconds`: o atraso que o motor vai descontar, para a simulação chegar no tempo. */
  follow(notes: readonly EngineNote[] | null, latencySeconds?: number): void;
}

export function isRehearsalEar(ear: Ear): ear is RehearsalEar {
  return typeof (ear as Partial<RehearsalEar>).follow === 'function';
}

/**
 * Só no desenvolvimento (?ouvido=simulado): sem música, toca as quatro cordas soltas em sequência;
 * na partida, toca as notas certas no tempo. Tem um AudioContext próprio, como o microfone, para a
 * orquestra e o relógio do jogo funcionarem sem violino nem microfone.
 */
export function createSimulatedEar(): RehearsalEar {
  const fake = createFakeEar();
  let timer: ReturnType<typeof setInterval> | undefined;
  let audio: EarAudio | null = null;
  let a4 = DEFAULT_A4;
  let script: TimedReading[] | null = null;
  let next = 0;
  let wasSounding = false;

  const openStrings = (t: number) => {
    const slot = Math.floor(t / (NOTE_S + GAP_S));
    const sounding = t % (NOTE_S + GAP_S) < NOTE_S;
    if (sounding) {
      fake.pitch(reading(OPEN_STRING_MIDI[slot % 4], t, Math.round(Math.sin(t * 3) * 4), -18));
      fake.level(-18);
    } else {
      if (wasSounding) fake.pitch(null);
      fake.level(-58);
    }
    wasSounding = sounding;
  };

  const tick = () => {
    if (!audio) return;
    const now = audio.context.currentTime;
    if (!script) return openStrings(now);
    for (; next < script.length && script[next].time <= now; next++) fake.pitch(script[next].reading);
    fake.level(-18);
  };

  return {
    ...fake,
    async start() {
      await fake.start();
      if (timer) return;
      const context = new AudioContext({ latencyHint: 'interactive' });
      await context.resume().catch(() => undefined);
      audio = { context, source: context.createGain(), stream: null };
      timer = setInterval(tick, TICK_MS);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
      void audio?.context.close().catch(() => undefined);
      audio = null;
      script = null;
      fake.stop();
    },
    audio: () => audio,
    setA4(next) {
      a4 = next;
      fake.setA4(next);
    },
    follow(notes, latencySeconds = 0) {
      script = notes ? renderPerformance(notes, a4, { latencySeconds }).readings : null;
      next = 0;
    },
  };
}
