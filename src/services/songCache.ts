import { LEVELS, parseSong, type Level, type Song } from '../game/notation/song';
import type { LoadedSong, SongSheet } from './songs';

/** Música aberta com rede, guardada no aparelho por (id, nível) para tocar sem internet. */
export interface CachedSong {
  id: string;
  level: Level;
  /** Hash do chart no servidor: igual ao guardado, nada é regravado. */
  hash: string;
  sheet: SongSheet;
  song: Song;
  /** Quando o chart foi gravado (muda só quando o hash muda). */
  savedAt: number;
  /** Última vez que foi aberta: as menos abertas saem primeiro quando passa do limite. */
  openedAt: number;
}

/** Onde as músicas ficam: o IndexedDB no app, a memória nos testes. */
export interface SongStore {
  get(id: string, level: Level): Promise<CachedSong | undefined>;
  put(entry: CachedSong): Promise<void>;
  delete(id: string, level: Level): Promise<void>;
  all(): Promise<CachedSong[]>;
}

/** Música que toca sem internet: a ficha e os níveis guardados, de fácil a difícil. */
export interface SavedSong {
  sheet: SongSheet;
  levels: Level[];
}

export interface SongCache {
  /** Guarda a música que veio do servidor; com o mesmo hash, só marca que foi aberta. */
  remember(loaded: LoadedSong, level: Level): Promise<'saved' | 'unchanged'>;
  /** A guardada, ou nada se não há ou se ficou num formato que o app não lê mais. */
  find(id: string, level: Level): Promise<LoadedSong | undefined>;
  list(): Promise<SavedSong[]>;
}

/** Cada chart tem dezenas de KB: 40 níveis guardados cabem com folga em qualquer aparelho. */
export const SONG_CACHE_LIMIT = 40;

export function createSongCache(store: SongStore, { limit = SONG_CACHE_LIMIT, now = Date.now } = {}): SongCache {
  async function evict() {
    const all = await store.all();
    if (all.length <= limit) return;
    const oldest = all.sort((a, b) => a.openedAt - b.openedAt).slice(0, all.length - limit);
    await Promise.all(oldest.map((e) => store.delete(e.id, e.level)));
  }

  return {
    async remember({ sheet, song, hash }, level) {
      const at = now();
      const current = await store.get(sheet.id, level);
      if (current?.hash === hash) {
        await store.put({ ...current, openedAt: at });
        return 'unchanged';
      }
      await store.put({ id: sheet.id, level, hash, sheet, song, savedAt: at, openedAt: at });
      await evict();
      return 'saved';
    },

    async find(id, level) {
      const entry = await store.get(id, level);
      if (!entry) return undefined;
      try {
        return { sheet: entry.sheet, song: parseSong(entry.song), hash: entry.hash };
      } catch {
        // Gravada por uma versão do app com outro formato de partitura: some, e volta na próxima vez com rede
        await store.delete(id, level);
        return undefined;
      }
    },

    async list() {
      const byId = new Map<string, { sheet: SongSheet; openedAt: number; levels: Set<Level> }>();
      for (const entry of await store.all()) {
        const song = byId.get(entry.id);
        if (!song) byId.set(entry.id, { sheet: entry.sheet, openedAt: entry.openedAt, levels: new Set([entry.level]) });
        else {
          song.levels.add(entry.level);
          // A ficha mais nova vale (título ou andamento podem ter mudado no servidor)
          if (entry.openedAt > song.openedAt) Object.assign(song, { sheet: entry.sheet, openedAt: entry.openedAt });
        }
      }
      return [...byId.values()].map(({ sheet, levels }) => ({ sheet, levels: LEVELS.filter((l) => levels.has(l)) }));
    },
  };
}

export function memorySongStore(): SongStore {
  const entries = new Map<string, CachedSong>();
  const key = (id: string, level: Level) => `${id}\u0000${level}`;
  return {
    get: async (id, level) => entries.get(key(id, level)),
    put: async (entry) => void entries.set(key(entry.id, entry.level), entry),
    delete: async (id, level) => void entries.delete(key(id, level)),
    all: async () => [...entries.values()],
  };
}

export const SONG_DB_NAME = 'violin-hero';
export const SONG_DB_STORE = 'songs';

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** O IndexedDB do aparelho, aberto só no primeiro uso. Sem ele (aba anônima de alguns navegadores), cada leitura falha e quem chama segue sem cache. */
export function indexedDbSongStore(factory: IDBFactory): SongStore {
  let opening: Promise<IDBDatabase> | null = null;
  const db = () => {
    if (!opening) {
      const request = factory.open(SONG_DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(SONG_DB_STORE, { keyPath: ['id', 'level'] });
      opening = done(request);
      opening.catch(() => (opening = null));
    }
    return opening;
  };
  const run = async <T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) =>
    done(action((await db()).transaction(SONG_DB_STORE, mode).objectStore(SONG_DB_STORE)));
  return {
    get: (id, level) => run('readonly', (s) => s.get([id, level]) as IDBRequest<CachedSong | undefined>),
    put: async (entry) => void (await run('readwrite', (s) => s.put(entry))),
    delete: async (id, level) => void (await run('readwrite', (s) => s.delete([id, level]))),
    all: () => run('readonly', (s) => s.getAll() as IDBRequest<CachedSong[]>),
  };
}

/** O cache do app; null onde não há IndexedDB (testes em jsdom). */
export const songCache: SongCache | null = typeof indexedDB === 'undefined' ? null : createSongCache(indexedDbSongStore(indexedDB));
