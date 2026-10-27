import { LEVELS, parseSong, type Level, type Song } from '../game/notation/song';
import { BY_USER, deviceDb, SONGS_STORE, type DeviceDb } from './deviceDb';
import type { LoadedSong, SongSheet } from './songs';
import { currentUserId } from './user';

/** Música aberta com rede, guardada no aparelho por (id, nível) para tocar sem internet. */
export interface CachedSong {
  /** Dono: a música guardada de um usuário não aparece para outro no mesmo aparelho. */
  userId: string;
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
  get(userId: string, id: string, level: Level): Promise<CachedSong | undefined>;
  put(entry: CachedSong): Promise<void>;
  delete(userId: string, id: string, level: Level): Promise<void>;
  all(userId: string): Promise<CachedSong[]>;
  /** Apaga tudo do usuário (troca de conta). */
  clear(userId: string): Promise<void>;
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

/** `user`: o dono da vez; sem usuário conhecido (antes da primeira sessão), o balde vazio ''. */
export function createSongCache(
  store: SongStore,
  { limit = SONG_CACHE_LIMIT, now = Date.now, user = (): string => currentUserId() ?? '' } = {}
): SongCache {
  async function evict(userId: string) {
    const all = await store.all(userId);
    if (all.length <= limit) return;
    const oldest = all.sort((a, b) => a.openedAt - b.openedAt).slice(0, all.length - limit);
    await Promise.all(oldest.map((e) => store.delete(userId, e.id, e.level)));
  }

  return {
    async remember({ sheet, song, hash }, level) {
      const at = now();
      const userId = user();
      const current = await store.get(userId, sheet.id, level);
      if (current?.hash === hash) {
        await store.put({ ...current, openedAt: at });
        return 'unchanged';
      }
      await store.put({ userId, id: sheet.id, level, hash, sheet, song, savedAt: at, openedAt: at });
      await evict(userId);
      return 'saved';
    },

    async find(id, level) {
      const userId = user();
      const entry = await store.get(userId, id, level);
      if (!entry) return undefined;
      try {
        return { sheet: entry.sheet, song: parseSong(entry.song), hash: entry.hash };
      } catch {
        // Gravada por uma versão do app com outro formato de partitura: some, e volta na próxima vez com rede
        await store.delete(userId, id, level);
        return undefined;
      }
    },

    async list() {
      const byId = new Map<string, { sheet: SongSheet; openedAt: number; levels: Set<Level> }>();
      for (const entry of await store.all(user())) {
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
  const key = (userId: string, id: string, level: Level) => `${userId}\u0000${id}\u0000${level}`;
  return {
    get: async (userId, id, level) => entries.get(key(userId, id, level)),
    put: async (entry) => void entries.set(key(entry.userId, entry.id, entry.level), entry),
    delete: async (userId, id, level) => void entries.delete(key(userId, id, level)),
    all: async (userId) => [...entries.values()].filter((e) => e.userId === userId),
    clear: async (userId) => {
      for (const [k, e] of entries) if (e.userId === userId) entries.delete(k);
    },
  };
}

/** O store do IndexedDB do aparelho (deviceDb.ts). */
export function indexedDbSongStore(factory: IDBFactory | DeviceDb): SongStore {
  const run = typeof factory === 'function' ? factory : deviceDb(factory);
  return {
    get: (userId, id, level) => run(SONGS_STORE, 'readonly', (s) => s.get([userId, id, level]) as IDBRequest<CachedSong | undefined>),
    put: async (entry) => void (await run(SONGS_STORE, 'readwrite', (s) => s.put(entry))),
    delete: async (userId, id, level) => void (await run(SONGS_STORE, 'readwrite', (s) => s.delete([userId, id, level]))),
    all: (userId) => run(SONGS_STORE, 'readonly', (s) => s.index(BY_USER).getAll(userId) as IDBRequest<CachedSong[]>),
    clear: async (userId) => {
      const keys = await run(SONGS_STORE, 'readonly', (s) => s.index(BY_USER).getAllKeys(userId));
      await Promise.all(keys.map((k) => run(SONGS_STORE, 'readwrite', (s) => s.delete(k))));
    },
  };
}

/** O store do app; null onde não há IndexedDB (testes em jsdom). A troca de conta apaga por ele. */
export const songStore: SongStore | null = typeof indexedDB === 'undefined' ? null : indexedDbSongStore(indexedDB);

/** O cache do app, sempre do usuário da vez (user.ts). */
export const songCache: SongCache | null = songStore ? createSongCache(songStore) : null;
