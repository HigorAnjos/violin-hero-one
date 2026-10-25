import { openMicrophone, startLevelMeter, startPitch, type PitchListener } from '../game/audio';
import type { Ear, LevelListener } from './Ear';

export interface MicrophoneEarDeps {
  openMicrophone: typeof openMicrophone;
  startPitch: typeof startPitch;
  startLevelMeter: typeof startLevelMeter;
}

const REAL: MicrophoneEarDeps = { openMicrophone, startPitch, startLevelMeter };

/**
 * O Ouvido de verdade: abre o microfone cru, liga a detecção de afinação e o medidor de nível na
 * mesma fonte. Um só por app: start() repetido reaproveita o que já está aberto.
 */
export function createMicrophoneEar(deps: MicrophoneEarDeps = REAL): Ear {
  const pitchListeners = new Set<PitchListener>();
  const levelListeners = new Set<LevelListener>();
  let opening: Promise<void> | null = null;
  let close: (() => void) | null = null;

  const open = async () => {
    const mic = await deps.openMicrophone();
    try {
      const pitch = await deps.startPitch(mic.source, (reading) => pitchListeners.forEach((l) => l(reading)));
      const level = deps.startLevelMeter(mic.context, mic.source, (db) => levelListeners.forEach((l) => l(db)));
      close = () => {
        level.stop();
        void pitch.stop().finally(() => mic.stop());
      };
    } catch (error) {
      await mic.stop().catch(() => undefined);
      throw error;
    }
  };

  return {
    start() {
      if (!opening) {
        // Falhou: o próximo start() pede de novo (o jogador pode ter liberado no cadeado)
        opening = open().catch((error) => {
          opening = null;
          throw error;
        });
      }
      return opening;
    },
    stop() {
      close?.();
      close = null;
      opening = null;
    },
    onPitch(listener) {
      pitchListeners.add(listener);
      return () => void pitchListeners.delete(listener);
    },
    onLevel(listener) {
      levelListeners.add(listener);
      return () => void levelListeners.delete(listener);
    },
  };
}
