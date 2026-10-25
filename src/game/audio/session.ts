import { DEFAULT_A4 } from '../notation/violin';
import { startLevelMeter, type LevelMeterHandle } from './level';
import { openMicrophone, type Microphone } from './microphone';
import { startPitch, type PitchHandle } from './pitch';
import { assertA4 } from './tuning';
import type { PitchListener } from './types';

/** O que as telas usam do microfone aberto: relógio (context), fonte para calibração e o rótulo do aparelho. */
export interface MicAudio {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  label: string;
}

/** 'hidden': a aba sumiu ou a tela bloqueou; 'stopped': alguém chamou close(). */
export type MicCloseReason = 'hidden' | 'stopped';

/** O pedaço do `document` que a sessão escuta; injetável nos testes. */
export interface VisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export interface MicSessionDeps {
  openMicrophone: typeof openMicrophone;
  startPitch: typeof startPitch;
  startLevelMeter: typeof startLevelMeter;
}

export interface MicSessionOptions {
  a4?: number;
  document?: VisibilitySource | null;
  deps?: MicSessionDeps;
}

export interface MicSession {
  /** Abre o microfone, ou devolve o que já está aberto (ou abrindo): um microfone por app. */
  open(signal?: AbortSignal): Promise<MicAudio>;
  /** Fecha já; um pedido ainda na permissão fecha assim que o navegador entregar o microfone. */
  close(): void;
  audio(): MicAudio | null;
  readonly a4: number;
  setA4(a4: number): void;
  onPitch(listener: PitchListener): () => void;
  onLevel(listener: (dbfs: number) => void): () => void;
  onClose(listener: (reason: MicCloseReason) => void): () => void;
  /** Para de escutar a visibilidade e fecha sem avisar ninguém. */
  dispose(): void;
}

/** O pedido de abrir foi cancelado (close, aba oculta ou AbortSignal) antes de o microfone chegar. */
export class MicClosedError extends Error {
  override readonly name = 'MicClosedError';
  constructor() {
    super('microfone fechado antes de abrir');
  }
}

export function isMicClosed(error: unknown): error is MicClosedError {
  return error instanceof MicClosedError;
}

const REAL: MicSessionDeps = { openMicrophone, startPitch, startLevelMeter };

interface Live {
  mic: Microphone;
  pitch?: PitchHandle;
  level?: LevelMeterHandle;
}

interface Attempt {
  promise: Promise<MicAudio>;
  cancelled: boolean;
  pinned: boolean;
  waiting: number;
}

function audioOf(mic: Microphone): MicAudio {
  return { context: mic.context, source: mic.source, stream: mic.stream, label: mic.label };
}

async function shutdown({ mic, pitch, level }: Live): Promise<void> {
  level?.stop();
  await pitch?.stop().catch(() => undefined);
  await mic.stop().catch(() => undefined);
}

/**
 * Dono único do microfone: abre o microfone cru com afinação e nível na mesma fonte, fecha quando
 * pedem ou quando a página fica oculta, e avisa quem usa.
 */
export function createMicSession(options: MicSessionOptions = {}): MicSession {
  const deps = options.deps ?? REAL;
  const doc = options.document === undefined ? (globalThis.document ?? null) : options.document;
  let a4 = options.a4 ?? DEFAULT_A4;
  assertA4(a4);

  const pitchListeners = new Set<PitchListener>();
  const levelListeners = new Set<(dbfs: number) => void>();
  const closeListeners = new Set<(reason: MicCloseReason) => void>();
  let live: Live | null = null;
  let attempt: Attempt | null = null;
  let closing: Promise<void> | null = null;

  const release = (target: Live) => {
    const done: Promise<void> = shutdown(target).finally(() => {
      if (closing === done) closing = null;
    });
    closing = done;
  };

  const begin = (): Attempt => {
    const mine = { cancelled: false, pinned: false, waiting: 0 } as Attempt;
    mine.promise = (async () => {
      // Só espera se há um fechamento em curso: no caminho comum o openMicrophone roda dentro do gesto (iOS).
      if (closing) await closing;
      if (mine.cancelled) throw new MicClosedError();
      const opened: Live = { mic: await deps.openMicrophone() };
      try {
        if (!mine.cancelled) {
          opened.pitch = await deps.startPitch(opened.mic.source, (r) => pitchListeners.forEach((l) => l(r)), { a4 });
        }
        if (!mine.cancelled) {
          opened.level = deps.startLevelMeter(opened.mic.context, opened.mic.source, (db) => levelListeners.forEach((l) => l(db)));
        }
      } catch (error) {
        await shutdown(opened);
        throw error;
      }
      if (mine.cancelled) {
        release(opened);
        throw new MicClosedError();
      }
      if (opened.pitch && opened.pitch.a4 !== a4) opened.pitch.setA4(a4);
      live = opened;
      attempt = null;
      return audioOf(opened.mic);
    })();
    mine.promise.catch(() => {
      if (attempt === mine) attempt = null;
    });
    return mine;
  };

  const shut = (reason: MicCloseReason | null) => {
    const active = live !== null || attempt !== null;
    if (attempt) {
      attempt.cancelled = true;
      attempt = null;
    }
    if (live) {
      const target = live;
      live = null;
      release(target);
    }
    if (active && reason) closeListeners.forEach((l) => l(reason));
  };

  const onVisibility = () => {
    if (doc?.visibilityState === 'hidden') shut('hidden');
  };
  doc?.addEventListener('visibilitychange', onVisibility);

  return {
    open(signal) {
      if (signal?.aborted) return Promise.reject(new MicClosedError());
      if (live) return Promise.resolve(audioOf(live.mic));
      const mine = (attempt ??= begin());
      if (!signal) {
        mine.pinned = true;
        return mine.promise;
      }
      mine.waiting += 1;
      return new Promise<MicAudio>((resolve, reject) => {
        const onAbort = () => {
          mine.waiting -= 1;
          reject(new MicClosedError());
          if (!mine.pinned && mine.waiting === 0 && attempt === mine) shut(null);
        };
        signal.addEventListener('abort', onAbort, { once: true });
        mine.promise.then(
          (audio) => {
            signal.removeEventListener('abort', onAbort);
            resolve(audio);
          },
          (error: unknown) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
          },
        );
      });
    },
    close() {
      shut('stopped');
    },
    audio() {
      return live ? audioOf(live.mic) : null;
    },
    get a4() {
      return a4;
    },
    setA4(next) {
      assertA4(next);
      a4 = next;
      live?.pitch?.setA4(next);
    },
    onPitch(listener) {
      pitchListeners.add(listener);
      return () => void pitchListeners.delete(listener);
    },
    onLevel(listener) {
      levelListeners.add(listener);
      return () => void levelListeners.delete(listener);
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => void closeListeners.delete(listener);
    },
    dispose() {
      doc?.removeEventListener('visibilitychange', onVisibility);
      shut(null);
    },
  };
}
