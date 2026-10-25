import { createMicSession, isMicClosed, type MicAudio, type MicCloseReason, type MicSession } from '../game/audio';
import type { Ear } from './Ear';

/** O Ouvido de verdade e o que as telas de jogo precisam além dele: relógio e fonte, Lá e aviso de fechamento. */
export interface MicrophoneEar extends Ear {
  audio(): MicAudio | null;
  setA4(a4: number): void;
  onClosed(listener: (reason: MicCloseReason) => void): () => void;
}

/** Porta das telas sobre a MicSession, a dona única do microfone. */
export function createMicrophoneEar(session: MicSession = createMicSession()): MicrophoneEar {
  return {
    async start() {
      try {
        await session.open();
      } catch (error) {
        // Fechado por stop() ou aba oculta antes de abrir: quem pediu já saiu, não é problema de microfone
        if (!isMicClosed(error)) throw error;
      }
    },
    stop: () => session.close(),
    onPitch: (listener) => session.onPitch(listener),
    onLevel: (listener) => session.onLevel(listener),
    audio: () => session.audio(),
    setA4: (a4) => session.setA4(a4),
    onClosed: (listener) => session.onClose(listener),
  };
}
