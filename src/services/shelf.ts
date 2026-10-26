import { FIXED_SONGS, findFixedSong } from '../game/notation/songs';
import { LEVELS, songDurationSeconds, type Level, type Song } from '../game/notation/song';
import { songCache, type SavedSong, type SongCache } from './songCache';
import { SongError, useCatalog, useSavedSongs, useSong, type CatalogEntry, type SongErrorKind, type SongsClient } from './songs';
import { supabase } from './supabase';

/** Música na estante: a ficha do catálogo ou de uma das embutidas, sem as notas. */
export interface ShelfSong {
  id: string;
  title: string;
  composer: string;
  bpm: number;
  key: string;
  durationSeconds: number;
  /** Níveis que dá para tocar agora, de fácil a difícil. */
  levels: Level[];
  /** Vem no app: toca sem internet (só no Fácil). */
  embedded: boolean;
  /** Baixada: algum nível já foi aberto com internet e está guardado no aparelho. */
  saved: boolean;
}

export type Shelf =
  | { status: 'loading' }
  /** `fallback`: o catálogo não veio e a estante são as embutidas e as baixadas; o motivo fica em `reason`. */
  | { status: 'ready'; songs: ShelfSong[]; fallback: false }
  | { status: 'ready'; songs: ShelfSong[]; fallback: true; reason: SongErrorKind };

function embeddedSong(song: Song): ShelfSong {
  return {
    id: song.id,
    title: song.title,
    composer: song.composer,
    bpm: song.bpm,
    key: song.key,
    durationSeconds: songDurationSeconds(song),
    levels: [song.level],
    embedded: true,
    saved: false,
  };
}

/** As embutidas, para o primeiro uso e para quando o banco não responde. */
export const EMBEDDED_SHELF: readonly ShelfSong[] = FIXED_SONGS.map(({ song }) => embeddedSong(song));

export function catalogShelf(entries: readonly CatalogEntry[], saved: readonly SavedSong[] = []): ShelfSong[] {
  const savedIds = new Set(saved.map((s) => s.sheet.id));
  return entries.map(({ id, title, composer, bpm, key, durationSeconds, levels }) => ({
    id,
    title,
    composer,
    bpm,
    key,
    durationSeconds,
    levels,
    embedded: Boolean(findFixedSong(id)),
    saved: savedIds.has(id),
  }));
}

/**
 * Sem catálogo: as embutidas e, depois delas, as baixadas, cada uma com os níveis que tocam sem internet
 * (a embutida ganha os níveis que o jogador já abriu além do Fácil).
 */
export function offlineShelf(saved: readonly SavedSong[]): ShelfSong[] {
  const byId = new Map(saved.map((s) => [s.sheet.id, s]));
  const union = (a: readonly Level[], b: readonly Level[]) => LEVELS.filter((l) => a.includes(l) || b.includes(l));
  const embedded = EMBEDDED_SHELF.map((song) => {
    const kept = byId.get(song.id);
    return kept ? { ...song, levels: union(song.levels, kept.levels), saved: true } : song;
  });
  const others = saved
    .filter((s) => !findFixedSong(s.sheet.id))
    .map(({ sheet: { id, title, composer, bpm, key, durationSeconds }, levels }) => ({
      id,
      title,
      composer,
      bpm,
      key,
      durationSeconds,
      levels,
      embedded: false,
      saved: true,
    }));
  return [...embedded, ...others];
}

const errorKind = (error: unknown): SongErrorKind => (error instanceof SongError ? error.kind : 'server');

/** O catálogo do banco, com as baixadas marcadas; sem rede ou com erro, as embutidas e as baixadas. */
export function useShelf(client: SongsClient | null = supabase, cache: SongCache | null = songCache): Shelf {
  const catalog = useCatalog(client);
  const saved = useSavedSongs(cache);
  if (catalog.isPending) return { status: 'loading' };
  if (catalog.isError) {
    if (saved.isPending) return { status: 'loading' };
    return { status: 'ready', songs: offlineShelf(saved.data ?? []), fallback: true, reason: errorKind(catalog.error) };
  }
  return { status: 'ready', songs: catalogShelf(catalog.data, saved.data), fallback: false };
}

/** A embutida serve no lugar do banco só no nível que ela tem (o Fácil). */
export function embeddedChart(id: string, level: Level): Song | undefined {
  const fixed = findFixedSong(id)?.song;
  return fixed?.level === level ? fixed : undefined;
}

export type PlayableSong =
  | { status: 'loading' }
  | { status: 'ready'; song: Song; embedded: boolean }
  | { status: 'error'; error: SongError; retry: () => void };

/**
 * A partitura do nível pronta para tocar: do banco por get_song (ou a baixada, sem rede) e, se nenhuma das duas
 * vier, a embutida do mesmo nível. Sem rede, sem baixada e sem embutida, o erro com a mensagem para a tela.
 */
export function usePlayableSong(id: string, level: Level, client: SongsClient | null = supabase, cache: SongCache | null = songCache): PlayableSong {
  const fixed = embeddedChart(id, level);
  const remote = useSong(id, level, client, cache);
  if (remote.isSuccess) return { status: 'ready', song: remote.data.song, embedded: false };
  if (remote.isError) {
    if (fixed) return { status: 'ready', song: fixed, embedded: true };
    return {
      status: 'error',
      error: remote.error instanceof SongError ? remote.error : new SongError('server', remote.error),
      retry: () => void remote.refetch(),
    };
  }
  return { status: 'loading' };
}
