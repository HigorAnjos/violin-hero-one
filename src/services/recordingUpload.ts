import { BY_USER, deviceDb, RECORDINGS_STORE, type DeviceDb } from './deviceDb';
import { backoff } from './playQueue';
import type { SessionState } from './session';

export type SignedInSession = Extract<SessionState, { status: 'signed-in' }>;

/** O que sobe: a gravação da entrega e o que o destino precisa para saber de que tarefa ela é. */
export interface UploadItem {
  /** Id da entrega, criado no aparelho: o nome do arquivo no destino. Reenviar o mesmo id não duplica. */
  id: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Turma, tarefa, partida…: o formato é do destino (o banco do ciclo 5). */
  meta: Readonly<Record<string, string>>;
}

/**
 * - `offline`: não chegou ao destino (rede, sessão): a fila inteira espera;
 * - `transient`: o destino recusou por agora (5xx, limite): esta gravação espera o recuo;
 * - `rejected`: nunca vai entrar (tarefa fechada, arquivo grande demais): sai da fila.
 */
export type UploadErrorKind = 'offline' | 'transient' | 'rejected';

export class UploadError extends Error {
  override readonly name = 'UploadError';
  constructor(
    readonly kind: UploadErrorKind,
    readonly cause?: unknown,
  ) {
    super(`envio da gravação: ${kind}`);
  }
}

/**
 * Para onde a gravação sobe (o Supabase Storage, no floor do banco). Sobe na conta da sessão recebida, nunca noutra;
 * o arquivo que já está lá com o mesmo id conta como enviado. Falha com UploadError; outro erro conta como `offline`.
 */
export interface UploadTarget {
  upload(session: SignedInSession, item: UploadItem): Promise<void>;
}

/** Uma gravação esperando o destino, guardada no aparelho até ele confirmar. */
export interface QueuedRecording {
  /** Dono: quem gravou. Só sobe com a sessão dele. */
  userId: string;
  id: string;
  /** Os bytes, não o Blob: o Safari já perdeu Blob guardado no IndexedDB. */
  bytes: ArrayBuffer;
  mimeType: string;
  durationMs: number;
  meta: Readonly<Record<string, string>>;
  queuedAt: number;
  /** Tentativas que o destino recusou com erro passageiro. */
  attempts: number;
  /** Antes disso, a gravação espera (recuo). */
  nextAt: number;
}

export interface RecordingQueueStore {
  all(userId: string): Promise<QueuedRecording[]>;
  put(entry: QueuedRecording): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

export function memoryRecordingQueueStore(): RecordingQueueStore {
  const entries = new Map<string, QueuedRecording>();
  const key = (userId: string, id: string) => `${userId}\u0000${id}`;
  return {
    all: async (userId) => [...entries.values()].filter((e) => e.userId === userId),
    put: async (entry) => void entries.set(key(entry.userId, entry.id), entry),
    delete: async (userId, id) => void entries.delete(key(userId, id)),
    clear: async (userId) => {
      for (const [k, e] of entries) if (e.userId === userId) entries.delete(k);
    },
  };
}

/** O store da fila no IndexedDB do aparelho (deviceDb.ts). */
export function indexedDbRecordingQueueStore(factory: IDBFactory | DeviceDb): RecordingQueueStore {
  const run = typeof factory === 'function' ? factory : deviceDb(factory);
  return {
    all: (userId) => run(RECORDINGS_STORE, 'readonly', (s) => s.index(BY_USER).getAll(userId) as IDBRequest<QueuedRecording[]>),
    put: async (entry) => void (await run(RECORDINGS_STORE, 'readwrite', (s) => s.put(entry))),
    delete: async (userId, id) => void (await run(RECORDINGS_STORE, 'readwrite', (s) => s.delete([userId, id]))),
    clear: async (userId) => {
      const keys = await run(RECORDINGS_STORE, 'readonly', (s) => s.index(BY_USER).getAllKeys(userId));
      await Promise.all(keys.map((k) => run(RECORDINGS_STORE, 'readwrite', (s) => s.delete(k))));
    },
  };
}

export interface RecordingUploadsDeps {
  store: RecordingQueueStore;
  /** O dono da vez (user.ts); null antes da primeira sessão. */
  user(): string | null;
  session(): Promise<SessionState>;
  /** null enquanto o destino não existe: a fila só guarda. */
  target(): UploadTarget | null;
  online?(): boolean;
  now?(): number;
  /** Gravação recusada de vez: fica no log, sem laço. */
  log?(message: string, detail: unknown): void;
}

/** Onde está cada gravação desta visita: na fila, no destino, ou recusada. */
export type UploadStatus = 'queued' | 'sent' | 'rejected';

export interface RecordingUploads {
  /** Guarda na fila do dono da vez e tenta subir. Sem dono no aparelho, recusa: gravação sem dono não sobe em conta nenhuma. */
  enqueue(item: UploadItem): Promise<void>;
  /** Sobe o que já pode ir. `strict` (troca de conta): ignora o recuo e lança se alguma ficar. */
  flush(userId?: string, options?: { strict?: boolean }): Promise<void>;
  pending(userId: string): Promise<number>;
  /** Apaga a fila do usuário (troca de conta). */
  forget(userId: string): Promise<void>;
  status(id: string): UploadStatus | undefined;
  subscribe(listener: () => void): () => void;
  /** Em quanto tempo vale tentar de novo; null com a fila vazia. */
  nextDelay(): number | null;
}

export class RecordingUploadError extends Error {
  constructor(readonly left: number) {
    super(left === 1 ? 'Uma gravação ainda não foi enviada.' : `${left} gravações ainda não foram enviadas.`);
    this.name = 'RecordingUploadError';
  }
}

type Step = 'sent' | 'dropped' | 'later' | 'stop';

const kindOf = (error: unknown): UploadErrorKind => (error instanceof UploadError ? error.kind : 'offline');

/**
 * Fila de envio das gravações, por usuário, como a de partidas (playQueue.ts): sobrevive a recarregar e a ficar sem
 * rede, tenta de novo com recuo e só sobe a gravação de um usuário com a sessão dele.
 */
export function createRecordingUploads(deps: RecordingUploadsDeps): RecordingUploads {
  const now = deps.now ?? Date.now;
  const online = deps.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const log = deps.log ?? ((message: string, detail: unknown) => console.warn(`[gravações] ${message}`, detail));
  const statuses = new Map<string, UploadStatus>();
  const listeners = new Set<() => void>();
  let failures = 0;
  let earliest: number | null = null;
  let running: Promise<void> = Promise.resolve();

  const mark = (id: string, status: UploadStatus) => {
    statuses.set(id, status);
    listeners.forEach((l) => l());
  };

  async function send(entry: QueuedRecording, session: SignedInSession, target: UploadTarget): Promise<Step> {
    const blob = new Blob([entry.bytes], { type: entry.mimeType });
    try {
      await target.upload(session, { id: entry.id, blob, mimeType: entry.mimeType, durationMs: entry.durationMs, meta: entry.meta });
    } catch (error) {
      const kind = kindOf(error);
      if (kind === 'offline') return 'stop';
      if (kind === 'rejected') {
        await deps.store.delete(entry.userId, entry.id);
        log(`gravação ${entry.id} recusada pelo destino`, error);
        mark(entry.id, 'rejected');
        return 'dropped';
      }
      entry.attempts += 1;
      entry.nextAt = now() + backoff(entry.attempts);
      await deps.store.put(entry);
      return 'later';
    }
    await deps.store.delete(entry.userId, entry.id);
    mark(entry.id, 'sent');
    return 'sent';
  }

  async function pass(userId: string | undefined, strict: boolean) {
    const owner = userId ?? deps.user();
    if (!owner) return;
    const entries = (await deps.store.all(owner)).sort((a, b) => a.queuedAt - b.queuedAt);
    earliest = null;
    if (!entries.length) {
      failures = 0;
      return;
    }
    const stuck = () => {
      failures += 1;
      if (strict) throw new RecordingUploadError(entries.length);
    };
    const target = deps.target();
    if (!target || !online()) return stuck();
    const session = await deps.session().catch((): SessionState => ({ status: 'offline' }));
    // A gravação de um usuário só sobe com a sessão dele
    if (session.status !== 'signed-in' || session.userId !== owner) return stuck();

    let left = 0;
    for (const entry of entries) {
      if (!strict && entry.nextAt > now()) {
        left += 1;
        earliest = Math.min(earliest ?? Infinity, entry.nextAt);
        continue;
      }
      const step = await send(entry, session, target);
      if (step === 'stop') return stuck();
      if (step === 'later') {
        left += 1;
        earliest = Math.min(earliest ?? Infinity, entry.nextAt);
      }
    }
    failures = 0;
    if (strict && left) throw new RecordingUploadError(left);
  }

  const flush: RecordingUploads['flush'] = (userId, { strict = false } = {}) => {
    // Uma passada por vez: duas ao mesmo tempo subiriam a mesma gravação duas vezes
    const next = running.then(() => pass(userId, strict));
    running = next.catch(() => undefined);
    return next;
  };

  return {
    async enqueue(item) {
      const userId = deps.user();
      if (!userId) throw new Error('gravação sem dono: o aparelho ainda não teve sessão');
      const at = now();
      await deps.store.put({
        userId,
        id: item.id,
        bytes: await item.blob.arrayBuffer(),
        mimeType: item.mimeType,
        durationMs: item.durationMs,
        meta: { ...item.meta },
        queuedAt: at,
        attempts: 0,
        nextAt: at,
      });
      mark(item.id, 'queued');
      void flush(userId).catch(() => undefined);
    },
    flush,
    async pending(userId) {
      return (await deps.store.all(userId)).length;
    },
    forget: (userId) => deps.store.clear(userId),
    status: (id) => statuses.get(id),
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    nextDelay() {
      if (failures) return backoff(failures);
      return earliest === null ? null : Math.max(0, earliest - now());
    },
  };
}

/** Destino de mentira, enquanto o Storage não existe e nos testes: guarda por dono e id, e cai quando mandam. */
export function memoryUploadTarget() {
  const files = new Map<string, { owner: string; item: UploadItem }>();
  let failure: UploadErrorKind | null = null;
  const target: UploadTarget & {
    files: typeof files;
    fail(kind: UploadErrorKind | null): void;
  } = {
    files,
    fail(kind) {
      failure = kind;
    },
    async upload(session, item) {
      if (failure) throw new UploadError(failure);
      const path = `${session.userId}/${item.id}`;
      if (!files.has(path)) files.set(path, { owner: session.userId, item });
    },
  };
  return target;
}
