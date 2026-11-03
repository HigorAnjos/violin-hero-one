import { createMicSession, isMicClosed, startRecording, type MicAudio, type MicCloseReason, type MicSession, type Recorder } from '../game/audio';
import { onAppPause } from '../services/platform';
import type { Ear } from './Ear';

/** O Ouvido de verdade e o que as telas de jogo precisam além dele: relógio e fonte, Lá e aviso de fechamento. */
export interface MicrophoneEar extends Ear {
  audio(): MicAudio | null;
  setA4(a4: number): void;
  onClosed(listener: (reason: MicCloseReason) => void): () => void;
  record(): Recorder;
}

/**
 * Porta das telas sobre a MicSession, a dona única do microfone. No celular, o app indo para o fundo fecha o
 * microfone como a aba oculta: a partida pausa e nada é gravado com a tela apagada.
 */
export function createMicrophoneEar(session: MicSession = createMicSession({ background: onAppPause })): MicrophoneEar {
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
    record: () => startRecording(session),
  };
}
