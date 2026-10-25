export interface Microphone {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  label: string;
  stop(): Promise<void>;
}

/** Problemas de microfone que a tela MicTrouble mostra, cada um com sua saída para o jogador. */
export type MicTrouble =
  | 'denied'
  | 'no-device'
  | 'in-use'
  | 'insecure'
  | 'unsupported'
  | 'audio-blocked'
  | 'unknown';

// Processamento de voz do navegador (AGC, supressão de ruído, cancelamento de eco) distorce nível e altura de nota sustentada.
export const RAW_AUDIO: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/** Pede o microfone sem processamento e devolve o contexto já rodando. Falhas: traduza com `micTrouble`. */
export async function openMicrophone(): Promise<Microphone> {
  if (!globalThis.isSecureContext) {
    throw new DOMException('insecure context', 'SecurityError');
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('getUserMedia unavailable', 'NotSupportedError');
  }
  // O Safari do iOS só libera áudio para um contexto criado e retomado dentro do gesto, antes do primeiro await.
  const context = new AudioContext({ latencyHint: 'interactive' });
  const resumed = context.resume();
  let stream: MediaStream | undefined;
  let source: MediaStreamAudioSourceNode;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: RAW_AUDIO, video: false });
    await resumed;
    if (context.state !== 'running') {
      throw new DOMException(`audio context is ${context.state}`, 'InvalidStateError');
    }
    source = context.createMediaStreamSource(stream);
  } catch (error) {
    stream?.getTracks().forEach((t) => t.stop());
    await context.close().catch(() => undefined);
    throw error;
  }
  const live = stream;
  return {
    context,
    stream: live,
    source,
    label: live.getAudioTracks()[0]?.label ?? '',
    async stop() {
      live.getTracks().forEach((t) => t.stop());
      source.disconnect();
      await context.close();
    },
  };
}

export function micTrouble(error: unknown): MicTrouble {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'SecurityError':
      return 'insecure';
    case 'NotAllowedError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-device';
    case 'NotReadableError':
    case 'AbortError':
      return 'in-use';
    case 'InvalidStateError':
      return 'audio-blocked';
    case 'NotSupportedError':
      return 'unsupported';
    default:
      return 'unknown';
  }
}
