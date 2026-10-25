// No ciclo 1 as músicas fixas vão no bundle; no ciclo 2 passam para o banco via seed-songs.
import escalaReMaior from '../../../content/songs/escala-re-maior.json';
import odeAAlegria from '../../../content/songs/ode-a-alegria.json';
import brilhaBrilhaEstrelinha from '../../../content/songs/brilha-brilha-estrelinha.json';
import { parseSong, type Song } from './song';

export interface CatalogSong {
  id: string;
  title: string;
  song: Song;
}

export const FIXED_SONG_SOURCES: readonly unknown[] = [escalaReMaior, odeAAlegria, brilhaBrilhaEstrelinha];

export const FIXED_SONGS: readonly CatalogSong[] = FIXED_SONG_SOURCES.map((raw) => {
  const song = parseSong(raw);
  return { id: song.id, title: song.title, song };
});

export function findFixedSong(id: string): CatalogSong | undefined {
  return FIXED_SONGS.find((entry) => entry.id === id);
}
