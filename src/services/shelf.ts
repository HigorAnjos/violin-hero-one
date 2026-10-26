import { FIXED_SONGS, findFixedSong } from '../game/notation/songs';
import { songDurationSeconds, type Level, type Song } from '../game/notation/song';
import { SongError, useCatalog, useSong, type CatalogEntry, type SongErrorKind, type SongsClient } from './songs';
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
}

export type Shelf =
  | { status: 'loading' }
  /** `fallback`: o catálogo não veio e a estante são só as embutidas; o motivo fica em `reason`. */
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
  };
}

/** As embutidas, para o primeiro uso e para quando o banco não responde. */
export const EMBEDDED_SHELF: readonly ShelfSong[] = FIXED_SONGS.map(({ song }) => embeddedSong(song));

export function catalogShelf(entries: readonly CatalogEntry[]): ShelfSong[] {
  return entries.map(({ id, title, composer, bpm, key, durationSeconds, levels }) => ({
    id,
    title,
    composer,
    bpm,
    key,
    durationSeconds,
    levels,
    embedded: Boolean(findFixedSong(id)),
  }));
}

const errorKind = (error: unknown): SongErrorKind => (error instanceof SongError ? error.kind : 'server');

/** O catálogo do banco; sem rede ou com erro, as embutidas. */
export function useShelf(client: SongsClient | null = supabase): Shelf {
  const catalog = useCatalog(client);
  if (catalog.isPending) return { status: 'loading' };
  if (catalog.isError) return { status: 'ready', songs: [...EMBEDDED_SHELF], fallback: true, reason: errorKind(catalog.error) };
  return { status: 'ready', songs: catalogShelf(catalog.data), fallback: false };
}

/** A embutida serve no lugar do banco só no nível que ela tem (o Fácil). */
export function embeddedChart(id: string, level: Level): Song | undefined {
  const fixed = findFixedSong(id)?.song;
  return fixed?.level === level ? fixed : undefined;
}

export type PlayableSong =
  | { status: 'loading' }
  | { status: 'ready'; song: Song; embedded: boolean }
  | { status: 'error'; error: SongError };

/**
 * A partitura do nível pronta para tocar: do banco por get_song e, se ele falhar, a embutida do mesmo nível. Sem
 * rede e sem embutida, o erro com a mensagem para a tela.
 */
export function usePlayableSong(id: string, level: Level, client: SongsClient | null = supabase): PlayableSong {
  const fixed = embeddedChart(id, level);
  const remote = useSong(id, level, client);
  if (remote.isSuccess) return { status: 'ready', song: remote.data.song, embedded: false };
  if (remote.isError) {
    if (fixed) return { status: 'ready', song: fixed, embedded: true };
    return { status: 'error', error: remote.error instanceof SongError ? remote.error : new SongError('server', remote.error) };
  }
  return { status: 'loading' };
}
