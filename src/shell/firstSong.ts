import { SONG_FORMAT_VERSION, type Song } from '../game/notation/song';

/**
 * Aquecimento da etapa "Primeira música" enquanto a biblioteca não chega: só cordas soltas, devagar,
 * começando pela Ré (como no design). Sai quando o floor de músicas entregar a primeira de verdade.
 */
export const WARM_UP_SONG: Song = {
  formatVersion: SONG_FORMAT_VERSION,
  id: 'aquecimento-cordas-soltas',
  title: 'Cordas soltas',
  composer: 'Violin Hero',
  key: 'D major',
  bpm: 80,
  timeSignature: { beats: 4, unit: 4 },
  level: 'easy',
  measures: [
    { beats: 4, notes: [{ beat: 0, beats: 4, midi: 62, string: 1, finger: 0 }] },
    { beats: 4, notes: [{ beat: 0, beats: 4, midi: 69, string: 2, finger: 0 }] },
    { beats: 4, notes: [{ beat: 0, beats: 4, midi: 55, string: 0, finger: 0 }] },
    { beats: 4, notes: [{ beat: 0, beats: 4, midi: 76, string: 3, finger: 0 }] },
  ],
};
