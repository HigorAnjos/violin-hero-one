import type { MicCloseReason, MicSession } from './session';

/** Os formatos que a entrega aceita, do preferido ao último: Opus no WebM (Chrome, Firefox, Android) e MP4 (Safari). */
export const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/mp4'] as const;
/** Mono a 48 kbit/s: ~1,1 MB em 3 min, bem abaixo dos 10 MB, e ainda dá para ouvir afinação e arco. */
export const RECORDING_BITS_PER_SECOND = 48_000;
/** O MediaRecorder entrega um pedaço por segundo: um erro no fim não leva a gravação inteira junto da memória do codificador. */
export const RECORDING_TIMESLICE_MS = 1000;

export interface RecordingFormat {
  mimeType: string;
  audioBitsPerSecond: number;
}

/** O primeiro formato da lista que o navegador grava; null quando nenhum (ou sem MediaRecorder). */
export function pickRecordingFormat(isTypeSupported: ((type: string) => boolean) | null = defaultIsTypeSupported()): RecordingFormat | null {
  if (!isTypeSupported) return null;
  const mimeType = RECORDING_TYPES.find((type) => isTypeSupported(type));
  return mimeType ? { mimeType, audioBitsPerSecond: RECORDING_BITS_PER_SECOND } : null;
}

function defaultIsTypeSupported(): ((type: string) => boolean) | null {
  const ctor = globalThis.MediaRecorder as typeof MediaRecorder | undefined;
  return ctor && typeof ctor.isTypeSupported === 'function' ? (type) => ctor.isTypeSupported(type) : null;
}

/** O que a partida gravou: o arquivo, quanto tempo de som ele tem (sem as pausas) e o tipo de verdade. */
export interface Recording {
  blob: Blob;
  durationMs: number;
  mimeType: string;
}

/**
 * - `unsupported`: o navegador não grava nenhum dos formatos;
 * - `no-microphone`: a MicSession ainda não abriu;
 * - `interrupted`: o microfone fechou no meio (aba oculta, tela bloqueada): a gravação teria um buraco;
 * - `discarded`: alguém descartou antes do fim;
 * - `failed`: o MediaRecorder deu erro.
 */
export type RecordingErrorKind = 'unsupported' | 'no-microphone' | 'interrupted' | 'discarded' | 'failed';

export class RecordingError extends Error {
  override readonly name = 'RecordingError';
  constructor(
    readonly kind: RecordingErrorKind,
    readonly reason?: MicCloseReason,
  ) {
    super(`gravação: ${kind}`);
  }
}

export type RecorderState = 'recording' | 'paused' | 'stopped';

export interface Recorder {
  readonly state: RecorderState;
  readonly mimeType: string;
  /** Junto da pausa da partida: o tempo pausado não entra no arquivo nem na duração. */
  pause(): void;
  resume(): void;
  /** Fecha o arquivo. Rejeita com RecordingError se a gravação foi interrompida, descartada ou falhou. */
  stop(): Promise<Recording>;
  /** Partida abandonada: para e joga fora o que gravou. */
  discard(): void;
}

type MediaRecorderCtor = new (stream: MediaStream, options?: MediaRecorderOptions) => MediaRecorder;

export interface RecorderOptions {
  /** Padrão: o do navegador. */
  MediaRecorder?: MediaRecorderCtor;
  /** Padrão: pickRecordingFormat(). */
  format?: RecordingFormat | null;
  /** Relógio da duração, em ms; padrão: performance.now. */
  now?: () => number;
}

/**
 * Grava o que o Ouvido ouve, sem um segundo getUserMedia: a fonte do microfone (a mesma do pitch) também alimenta um
 * MediaStreamDestination mono no AudioContext da MicSession, e o MediaRecorder grava esse stream. O nó novo só copia
 * amostras na thread de áudio; o pitch continua no worklet dele.
 */
export function startRecording(session: Pick<MicSession, 'audio' | 'onClose'>, options: RecorderOptions = {}): Recorder {
  const audio = session.audio();
  if (!audio) throw new RecordingError('no-microphone');
  const format = options.format === undefined ? pickRecordingFormat() : options.format;
  const Ctor = options.MediaRecorder ?? (globalThis.MediaRecorder as MediaRecorderCtor | undefined);
  if (!format || !Ctor) throw new RecordingError('unsupported');
  const now = options.now ?? (() => performance.now());

  const destination = audio.context.createMediaStreamDestination();
  // Microfone estéreo vira um canal só: metade do tamanho e o professor ouve o mesmo violino nos dois lados
  destination.channelCount = 1;
  destination.channelCountMode = 'explicit';
  destination.channelInterpretation = 'speakers';
  audio.source.connect(destination);

  const media = new Ctor(destination.stream, format);
  const mimeType = format.mimeType;
  const chunks: Blob[] = [];
  let state: RecorderState = 'recording';
  let failure: RecordingError | null = null;
  let activeMs = 0;
  let since = now();
  let finished: Promise<Blob> | null = null;
  let released = false;

  const settle = () => {
    if (state === 'recording') activeMs += now() - since;
    state = 'stopped';
  };

  const release = () => {
    if (released) return;
    released = true;
    offClose();
    try {
      audio.source.disconnect(destination);
    } catch {
      // A MicSession já desligou a fonte ao fechar
    }
    destination.stream.getTracks().forEach((t) => t.stop());
  };

  /** Para o MediaRecorder e espera o último pedaço. */
  const finish = (): Promise<Blob> =>
    (finished ??= new Promise<Blob>((resolve) => {
      const done = () => {
        release();
        resolve(new Blob(chunks, { type: media.mimeType || mimeType }));
      };
      if (media.state === 'inactive') return done();
      media.addEventListener('stop', done, { once: true });
      media.stop();
    }));

  const abort = (error: RecordingError) => {
    failure ??= error;
    if (state === 'stopped' && finished) return;
    settle();
    void finish().then(() => (chunks.length = 0));
  };

  media.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0 && !failure) chunks.push(event.data);
  });
  media.addEventListener('error', () => abort(new RecordingError('failed')));
  // O microfone fecha antes de a MicSession parar as trilhas: o MediaRecorder ainda fecha o arquivo direito
  const offClose = session.onClose((reason) => abort(new RecordingError('interrupted', reason)));

  media.start(RECORDING_TIMESLICE_MS);

  return {
    get state() {
      return state;
    },
    mimeType,
    pause() {
      if (state !== 'recording') return;
      activeMs += now() - since;
      state = 'paused';
      media.pause();
    },
    resume() {
      if (state !== 'paused') return;
      since = now();
      state = 'recording';
      media.resume();
    },
    async stop() {
      if (failure) throw failure;
      settle();
      const blob = await finish();
      if (failure) throw failure;
      return { blob, durationMs: Math.round(activeMs), mimeType: blob.type || mimeType };
    },
    discard() {
      abort(new RecordingError('discarded'));
    },
  };
}
