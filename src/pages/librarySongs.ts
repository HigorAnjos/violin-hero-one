import { useShelf, type Shelf, type ShelfSong } from '../services/shelf';
import { categoryOfSheet, useOwnSongs, useSavedSongs } from '../services/songs';

export type LibrarySong = ShelfSong & { origin?: string };

/**
 * A estante da Biblioteca: a do catálogo (ou as embutidas e as baixadas, sem internet) mais as do jogador (importadas e
 * escritas). A Inicial e o Perfil contam por aqui, para o número bater com o da Biblioteca.
 */
export function useLibrarySongs(): { shelf: Shelf; songs: LibrarySong[] } {
  const shelf = useShelf();
  const own = useOwnSongs();
  const kept = useSavedSongs();
  const mine = own.data ?? (kept.data ?? []).filter((s) => s.sheet.origin !== 'catalog').map((s) => ({ ...s.sheet, levels: s.levels }));
  const byId = new Map<string, LibrarySong>((shelf.status === 'ready' ? shelf.songs : []).map((s) => [s.id, s]));
  for (const song of mine) {
    byId.set(song.id, { ...song, category: categoryOfSheet(song), embedded: false, saved: !!kept.data?.some((s) => s.sheet.id === song.id) });
  }
  return { shelf, songs: [...byId.values()] };
}

/** As músicas da estante, sem os exercícios técnicos (o "11 músicas" da Biblioteca). */
export const musicsOf = (songs: readonly ShelfSong[]) => songs.filter((s) => s.category !== 'exercicio');
