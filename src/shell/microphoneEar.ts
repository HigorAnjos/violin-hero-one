import { createMicSession, isMicClosed, startRecording, type MicAudio, type MicCloseReason, type MicSession, type Recorder } from '../game/audio';
import { PORTRAIT_QUERY } from '../assets/styles/media';
import { onAppPause } from '../services/platform';
import type { Ear } from './Ear';

/** O Ouvido de verdade e o que as telas de jogo precisam além dele: relógio e fonte, Lá e aviso de fechamento. */
export interface MicrophoneEar extends Ear {
  audio(): MicAudio | null;
  setA4(a4: number): void;
  onClosed(listener: (reason: MicCloseReason) => void): () => void;
  record(): Recorder;
}

/** Chama `listener` quando o celular fica em pé (o mesmo corte dos estilos). Devolve a função que cancela. */
export function onPortrait(listener: () => void): () => void {
  if (typeof matchMedia !== 'function') return () => undefined;
  const list = matchMedia(PORTRAIT_QUERY);
  const onChange = () => {
    if (list.matches) listener();
  };
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** O app no fundo ou o celular ficando em pé: os dois pausam a partida do mesmo jeito. */
export function pauseSources(listener: () => void): () => void {
  const offs = [onAppPause(listener), onPortrait(listener)];
  return () => offs.forEach((off) => off());
}

/**
 * Porta das telas sobre a MicSession, a dona única do microfone. No celular, o app indo para o fundo (ou o celular
 * ficando em pé no meio da partida) fecha o microfone como a aba oculta: a partida pausa e nada é gravado.
 */
export function createMicrophoneEar(session: MicSession = createMicSession({ background: pauseSources })): MicrophoneEar {
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
