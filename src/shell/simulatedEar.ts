import { OPEN_STRING_MIDI } from '../game/notation/violin';
import type { Ear } from './Ear';
import { createFakeEar, reading } from './fakeEar';

const TICK_MS = 30;
/** Cada corda soa 2,6 s e depois 0,8 s de silêncio: dá para ver o "segurando" e a troca. */
const NOTE_S = 2.6;
const GAP_S = 0.8;

/**
 * Só no desenvolvimento (?ouvido=simulado): toca as quatro cordas soltas em sequência, para
 * conferir as telas com o portal sem violino nem microfone.
 */
export function createSimulatedEar(): Ear {
  const fake = createFakeEar();
  let timer: ReturnType<typeof setInterval> | undefined;
  let t = 0;
  let wasSounding = false;
  return {
    ...fake,
    async start() {
      await fake.start();
      if (timer) return;
      timer = setInterval(() => {
        t += TICK_MS / 1000;
        const slot = Math.floor(t / (NOTE_S + GAP_S));
        const sounding = t % (NOTE_S + GAP_S) < NOTE_S;
        const midi = OPEN_STRING_MIDI[slot % 4];
        if (sounding) {
          const cents = Math.round(Math.sin(t * 3) * 4);
          fake.pitch(reading(midi, t, cents, -18));
          fake.level(-18);
        } else {
          if (wasSounding) fake.pitch(null);
          fake.level(-58);
        }
        wasSounding = sounding;
      }, TICK_MS);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
  };
}
