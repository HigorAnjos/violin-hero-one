// Músicas embutidas no app para o primeiro uso e para jogar offline; o resto do catálogo vem do banco.
// fixedSongs.json é gerado de content/songs/*.musicxml por `npm run songs:fixed`: o conversor não entra no app.
import fixedSongs from './fixedSongs.json';
import { parseSong, type Song } from './song';

export interface CatalogSong {
  id: string;
  title: string;
  song: Song;
}

/** O nível Fácil de cada uma. */
export const FIXED_SONGS: readonly CatalogSong[] = fixedSongs.map((raw) => {
  const song = parseSong(raw);
  return { id: song.id, title: song.title, song };
});

export function findFixedSong(id: string): CatalogSong | undefined {
  return FIXED_SONGS.find((entry) => entry.id === id);
}
