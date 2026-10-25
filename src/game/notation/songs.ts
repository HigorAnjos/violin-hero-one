// No ciclo 1 as músicas fixas vão no bundle; no ciclo 2 passam para o banco via seed-songs.
import escalaReMaior from '../../../content/songs/escala-re-maior.musicxml?raw';
import odeAAlegria from '../../../content/songs/ode-a-alegria.musicxml?raw';
import brilhaBrilhaEstrelinha from '../../../content/songs/brilha-brilha-estrelinha.musicxml?raw';
import { convertSongFile } from './catalog';
import type { Song } from './song';

export interface CatalogSong {
  id: string;
  title: string;
  song: Song;
}

export const FIXED_SONG_SOURCES: readonly { name: string; content: string }[] = [
  { name: 'escala-re-maior.musicxml', content: escalaReMaior },
  { name: 'ode-a-alegria.musicxml', content: odeAAlegria },
  { name: 'brilha-brilha-estrelinha.musicxml', content: brilhaBrilhaEstrelinha },
];

/** O nível Fácil de cada uma, igual ao JSON do ciclo 1. */
export const FIXED_SONGS: readonly CatalogSong[] = FIXED_SONG_SOURCES.map((file) => {
  const song = convertSongFile(file).charts.easy;
  return { id: song.id, title: song.title, song };
});

export function findFixedSong(id: string): CatalogSong | undefined {
  return FIXED_SONGS.find((entry) => entry.id === id);
}
