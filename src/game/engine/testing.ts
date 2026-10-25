import type { PitchReading } from '../audio/types';
import type { Song, SongNote } from '../notation/song';
import { midiToFrequency, type StringIndex } from '../notation/violin';
import type { EngineNote } from './types';

export const A4 = 442;

export function engineNote(index: number, time: number, midi: number, duration = 0.6, string: StringIndex = 1): EngineNote {
  return { index, noteIndex: index, measure: 0, time, duration, midi, string, finger: 1, frequency: midiToFrequency(midi, A4) };
}

export function reading(time: number, midi: number, cents = 0, level = -12): PitchReading {
  const hz = midiToFrequency(midi, A4) * 2 ** (cents / 1200);
  return { time, hz, midi, cents, clarity: 0.97, level };
}

export const n = (beat: number, beats: number, midi: number, string: SongNote['string'], finger: SongNote['finger'], tie?: boolean): SongNote =>
  tie ? { beat, beats, midi, string, finger, tie } : { beat, beats, midi, string, finger };

/** Ode à Alegria, 4 primeiros compassos, Ré maior: 15 notas, uma ligadura no fim. */
export const ODE: Song = {
  formatVersion: 1,
  id: 'ode-a-alegria',
  title: 'Ode à Alegria',
  composer: 'Beethoven',
  key: 'D major',
  bpm: 100,
  timeSignature: { beats: 4, unit: 4 },
  level: 'easy',
  measures: [
    { beats: 4, notes: [n(0, 1, 78, 3, 1), n(1, 1, 78, 3, 1), n(2, 1, 79, 3, 2), n(3, 1, 81, 3, 3)] },
    { beats: 4, notes: [n(0, 1, 81, 3, 3), n(1, 1, 79, 3, 2), n(2, 1, 78, 3, 1), n(3, 1, 76, 3, 0)] },
    { beats: 4, notes: [n(0, 1, 74, 2, 3), n(1, 1, 74, 2, 3), n(2, 1, 76, 3, 0), n(3, 1, 78, 3, 1)] },
    { beats: 4, notes: [n(0, 1.5, 78, 3, 1), n(1.5, 0.5, 76, 3, 0), n(2, 1, 76, 3, 0), n(3, 1, 76, 3, 0, true)] },
  ],
};

/** Escala de Sol maior nas quatro cordas, repetida `times` vezes: 8 notas por volta, semínimas a 120 bpm. */
export function scaleSong(times = 1): Song {
  const scale: [number, StringIndex, SongNote['finger']][] = [
    [55, 0, 0], [57, 0, 1], [59, 0, 2], [62, 1, 0], [64, 1, 1], [69, 2, 0], [71, 2, 1], [76, 3, 0],
  ];
  const measures: Song['measures'] = [];
  for (let r = 0; r < times; r++) {
    measures.push({ beats: 4, notes: scale.slice(0, 4).map(([m, s, f], i) => n(i, 1, m, s, f)) });
    measures.push({ beats: 4, notes: scale.slice(4).map(([m, s, f], i) => n(i, 1, m, s, f)) });
  }
  return { ...ODE, id: 'escala', title: 'Escala', bpm: 120, measures };
}
