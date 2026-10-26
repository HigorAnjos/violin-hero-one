import { attacks, type Level, type Song } from '../game/notation/song';
import { BY_USER, deviceDb, PLAYS_STORE, type DeviceDb } from './deviceDb';
import { ProgressError, type PlayOutcome, type PlayPayload } from './progress';
import type { SessionState } from './session';
import { SongError } from './songs';

/** Uma partida esperando o servidor, guardada no aparelho até ele responder ok ou duplicate. */
export interface QueuedPlay {
  /** Dono: quem jogou. '' antes da primeira sessão no aparelho (passa para o primeiro usuário que entrar). */
  userId: string;
  clientId: string;
  payload: PlayPayload;
  /** Hash do chart jogado; null na embutida (fixedSongs.json não guarda o hash do banco). */
  chartHash: string | null;
  /** O chart veio do aparelho (baixada ou embutida): pode ter ficado velho, relê pelo get_song antes de enviar. */
  checkChart: boolean;
  queuedAt: number;
  /** Tentativas que o servidor recusou com erro passageiro. */
  attempts: number;
  /** Antes disso, a partida espera (recuo). */
  nextAt: number;
}

export interface PlayQueueStore {
  all(userId: string): Promise<QueuedPlay[]>;
  put(entry: QueuedPlay): Promise<void>;
  delete(userId: string, clientId: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

export function memoryPlayQueueStore(): PlayQueueStore {
  const entries = new Map<string, QueuedPlay>();
  const key = (userId: string, clientId: string) => `${userId}\u0000${clientId}`;
  return {
    all: async (userId) => [...entries.values()].filter((e) => e.userId === userId),
    put: async (entry) => void entries.set(key(entry.userId, entry.clientId), entry),
    delete: async (userId, clientId) => void entries.delete(key(userId, clientId)),
    clear: async (userId) => {
      for (const [k, e] of entries) if (e.userId === userId) entries.delete(k);
    },
  };
}

/** O store da fila no IndexedDB do aparelho (deviceDb.ts). */
export function indexedDbPlayQueueStore(factory: IDBFactory | DeviceDb): PlayQueueStore {
  const run = typeof factory === 'function' ? factory : deviceDb(factory);
  return {
    all: (userId) => run(PLAYS_STORE, 'readonly', (s) => s.index(BY_USER).getAll(userId) as IDBRequest<QueuedPlay[]>),
    put: async (entry) => void (await run(PLAYS_STORE, 'readwrite', (s) => s.put(entry))),
    delete: async (userId, clientId) => void (await run(PLAYS_STORE, 'readwrite', (s) => s.delete([userId, clientId]))),
    clear: async (userId) => {
      const keys = await run(PLAYS_STORE, 'readonly', (s) => s.index(BY_USER).getAllKeys(userId));
      await Promise.all(keys.map((k) => run(PLAYS_STORE, 'readwrite', (s) => s.delete(k))));
    },
  };
}

/** Recuo entre tentativas: 5 s, 10 s, 20 s… até 5 min. */
export const RETRY_BASE_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;
export const backoff = (failures: number) => Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, failures - 1));

/**
 * A partida cabe no chart? A mesma conta do submit_play: a partida inteira julga cada ataque uma vez. A prática
 * repete trechos e o teto dela depende da duração: quem decide é o servidor.
 */
export function playFitsChart(payload: PlayPayload, song: Song): boolean {
  if (payload.mode === 'practice') return true;
  const total = Object.values(payload.counts).reduce((sum, n) => sum + n, 0);
  const notes = attacks(song).length;
  return total <= notes && (!payload.finished || total === notes);
}

export interface PlaySyncDeps {
  store: PlayQueueStore;
  /** O dono da vez (user.ts); null antes da primeira sessão. */
  user(): string | null;
  session(): Promise<SessionState>;
  submit(session: SessionState, payload: PlayPayload): Promise<PlayOutcome>;
  /** get_song: o chart de agora no banco (lança SongError). */
  chart(session: SessionState, songId: string, level: Level): Promise<{ hash: string; song: Song }>;
  online?(): boolean;
  now?(): number;
  /** Partida descartada (recusa definitiva, chart que mudou): fica no log, sem laço. */
  log?(message: string, detail: unknown): void;
}

export type NewPlay = Pick<QueuedPlay, 'payload' | 'chartHash' | 'checkChart'>;

export interface PlaySync {
  /** Guarda a partida na fila do dono da vez. Não envia: quem chama pede o flush. */
  enqueue(play: NewPlay): Promise<void>;
  /**
   * Envia o que já pode ir. `strict` (troca de conta): ignora o recuo e lança se alguma partida ficar na fila.
   * Sem `userId`, a fila do dono da vez.
   */
  flush(userId?: string, options?: { strict?: boolean }): Promise<void>;
  pending(userId: string): Promise<number>;
  /** Apaga a fila do usuário (troca de conta). */
  forget(userId: string): Promise<void>;
  /** O que o servidor respondeu para a partida, nesta visita. */
  outcome(clientId: string): PlayOutcome | undefined;
  subscribe(listener: () => void): () => void;
  /** Em quanto tempo vale tentar de novo; null com a fila vazia. */
  nextDelay(): number | null;
}

export class PlaySyncError extends Error {
  constructor(readonly left: number) {
    super(left === 1 ? 'Uma partida ainda não foi enviada.' : `${left} partidas ainda não foram enviadas.`);
    this.name = 'PlaySyncError';
  }
}

type Step = 'sent' | 'dropped' | 'later' | 'stop';

export function createPlaySync(deps: PlaySyncDeps): PlaySync {
  const now = deps.now ?? Date.now;
  const online = deps.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false);
  const log = deps.log ?? ((message: string, detail: unknown) => console.warn(`[fila] ${message}`, detail));
  const outcomes = new Map<string, PlayOutcome>();
  const listeners = new Set<() => void>();
  // Falhas seguidas sem chegar ao servidor (rede, sessão): o recuo da fila inteira
  let failures = 0;
  // A próxima partida em recuo, da última passada
  let earliest: number | null = null;
  let running: Promise<void> = Promise.resolve();

  const drop = async (entry: QueuedPlay, reason: string, detail: unknown) => {
    await deps.store.delete(entry.userId, entry.clientId);
    log(`partida ${entry.clientId} (${entry.payload.song_id}, ${entry.payload.level}) descartada: ${reason}`, detail);
    return 'dropped' as const;
  };

  /** Chart velho: relê e, se mudou, manda só se a partida ainda cabe nele. */
  async function checkChart(entry: QueuedPlay, session: SessionState): Promise<Step | null> {
    let current: { hash: string; song: Song };
    try {
      current = await deps.chart(session, entry.payload.song_id, entry.payload.level);
    } catch (error) {
      if (error instanceof SongError && error.kind === 'not-found') return drop(entry, 'a música saiu do banco', error);
      // Partitura que o app não lê (formato novo): quem confere é o servidor
      if (error instanceof SongError && error.kind === 'invalid') return null;
      return 'stop';
    }
    if (current.hash !== entry.chartHash && !playFitsChart(entry.payload, current.song)) {
      return drop(entry, `o chart mudou (${entry.chartHash ?? 'embutido'} → ${current.hash}) e a partida não cabe nele`, null);
    }
    Object.assign(entry, { chartHash: current.hash, checkChart: false });
    await deps.store.put(entry);
    return null;
  }

  async function send(entry: QueuedPlay, session: SessionState): Promise<Step> {
    if (entry.checkChart) {
      const step = await checkChart(entry, session);
      if (step) return step;
    }
    try {
      const outcome = await deps.submit(session, entry.payload);
      await deps.store.delete(entry.userId, entry.clientId);
      outcomes.set(entry.clientId, outcome);
      listeners.forEach((l) => l());
      return 'sent';
    } catch (error) {
      const kind = error instanceof ProgressError ? error.kind : 'server';
      if (kind === 'rejected' || kind === 'not-found') return drop(entry, 'recusada pelo servidor', error);
      if (kind === 'offline') return 'stop';
      entry.attempts += 1;
      entry.nextAt = now() + backoff(entry.attempts);
      await deps.store.put(entry);
      return 'later';
    }
  }

  async function pass(userId: string | undefined, strict: boolean) {
    const owner = userId ?? deps.user() ?? '';
    // Partidas de antes da primeira sessão passam para o primeiro dono
    if (owner && owner === deps.user()) {
      for (const orphan of await deps.store.all('')) {
        await deps.store.put({ ...orphan, userId: owner });
        await deps.store.delete('', orphan.clientId);
      }
    }
    const entries = (await deps.store.all(owner)).sort((a, b) => a.queuedAt - b.queuedAt);
    earliest = null;
    if (!entries.length) {
      failures = 0;
      return;
    }
    const stuck = () => {
      failures += 1;
      if (strict) throw new PlaySyncError(entries.length);
    };
    if (!online()) return stuck();
    const session = await deps.session().catch((): SessionState => ({ status: 'offline' }));
    // A fila de um usuário só sobe com a sessão dele
    if (session.status !== 'signed-in' || session.userId !== owner) return stuck();

    let left = 0;
    for (const entry of entries) {
      if (!strict && entry.nextAt > now()) {
        left += 1;
        earliest = Math.min(earliest ?? Infinity, entry.nextAt);
        continue;
      }
      const step = await send(entry, session);
      if (step === 'stop') return stuck();
      if (step === 'later') {
        left += 1;
        earliest = Math.min(earliest ?? Infinity, entry.nextAt);
      }
    }
    failures = 0;
    if (strict && left) throw new PlaySyncError(left);
  }

  return {
    async enqueue({ payload, chartHash, checkChart: check }) {
      const at = now();
      await deps.store.put({
        userId: deps.user() ?? '',
        clientId: payload.client_id,
        payload,
        chartHash,
        checkChart: check,
        queuedAt: at,
        attempts: 0,
        nextAt: at,
      });
    },
    flush(userId, { strict = false } = {}) {
      // Uma passada por vez: duas ao mesmo tempo mandariam a mesma partida duas vezes
      const next = running.then(() => pass(userId, strict));
      running = next.catch(() => undefined);
      return next;
    },
    async pending(userId) {
      return (await deps.store.all(userId)).length;
    },
    forget: (userId) => deps.store.clear(userId),
    outcome: (clientId) => outcomes.get(clientId),
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
