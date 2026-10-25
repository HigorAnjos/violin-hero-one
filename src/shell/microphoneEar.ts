import { openMicrophone, startLevelMeter, startPitch, type PitchHandle, type PitchListener } from '../game/audio';
import { DEFAULT_A4 } from '../game/notation/violin';
import type { Ear, EarAudio, EarClosedReason, LevelListener } from './Ear';

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
  const closedListeners = new Set<(reason: EarClosedReason) => void>();
  let opening: Promise<void> | null = null;
  let close: (() => void) | null = null;
  let audio: EarAudio | null = null;
  let pitch: PitchHandle | null = null;
  let a4 = DEFAULT_A4;
  // stop() durante a permissão: o open() em andamento fecha o que abrir em vez de deixar sem dono
  let generation = 0;

  const open = async (mine: number) => {
    const mic = await deps.openMicrophone();
    try {
      const handle = await deps.startPitch(mic.source, (reading) => pitchListeners.forEach((l) => l(reading)), { a4 });
      const level = deps.startLevelMeter(mic.context, mic.source, (db) => levelListeners.forEach((l) => l(db)));
      const shut = () => {
        level.stop();
        void handle.stop().finally(() => mic.stop());
      };
      if (mine !== generation) shut();
      else {
        close = shut;
        pitch = handle;
        audio = { context: mic.context, source: mic.source, stream: mic.stream };
      }
    } catch (error) {
      await mic.stop().catch(() => undefined);
      throw error;
    }
  };

  return {
    start() {
      if (!opening) {
        const mine = generation;
        // Falhou: o próximo start() pede de novo (o jogador pode ter liberado no cadeado)
        opening = open(mine).catch((error) => {
          if (mine === generation) opening = null;
          throw error;
        });
      }
      return opening;
    },
    stop() {
      generation += 1;
      const wasOpen = opening !== null;
      close?.();
      close = null;
      opening = null;
      audio = null;
      pitch = null;
      if (wasOpen) closedListeners.forEach((l) => l('stopped'));
    },
    onPitch(listener) {
      pitchListeners.add(listener);
      return () => void pitchListeners.delete(listener);
    },
    onLevel(listener) {
      levelListeners.add(listener);
      return () => void levelListeners.delete(listener);
    },
    audio: () => audio,
    setA4(next) {
      a4 = next;
      pitch?.setA4(next);
    },
    onClosed(listener) {
      closedListeners.add(listener);
      return () => void closedListeners.delete(listener);
    },
  };
}
