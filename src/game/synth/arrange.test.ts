import { describe, expect, it } from 'vitest';
import { ODE, n } from '../engine/testing';
import { songDurationBeats, timeline, type Song } from '../notation/song';
import { FIXED_SONGS, findFixedSong } from '../notation/songs';
import {
  BASS_FLOOR,
  CHORD_FLOOR,
  HIGHEST_ORCHESTRA_MIDI,
  LOWEST_ORCHESTRA_MIDI,
  PARTS,
  arrange,
  chordSpans,
  clashes,
  parseKey,
  placeAbove,
  triad,
} from './arrange';

const D = 2;
const G = 7;
const A = 9;

describe('parseKey e tríades', () => {
  it.each([
    ['C major', 0, 'major'],
    ['D major', 2, 'major'],
    ['F# major', 6, 'major'],
    ['B♭ major', 10, 'major'],
    [' a Minor ', 9, 'minor'],
  ])('%s → %s %s', (key, tonic, mode) => {
    expect(parseKey(key)).toEqual({ tonic, mode });
  });

  it.each(['C', 'H major', 'D dorian', ''])('recusa "%s"', (key) => {
    expect(() => parseKey(key)).toThrow(RangeError);
  });

  it('I, IV e V de Ré maior são Ré, Sol e Lá maiores; no menor, i e iv menores e V maior', () => {
    const major = parseKey('D major');
    expect(triad(major, 'I')).toEqual([2, 6, 9]);
    expect(triad(major, 'IV')).toEqual([7, 11, 2]);
    expect(triad(major, 'V')).toEqual([9, 1, 4]);
    const minor = parseKey('A minor');
    expect(triad(minor, 'I')).toEqual([9, 0, 4]);
    expect(triad(minor, 'IV')).toEqual([2, 5, 9]);
    expect(triad(minor, 'V')).toEqual([4, 8, 11]);
  });

  it('placeAbove põe a classe de altura na oitava que começa no midi dado', () => {
    expect(placeAbove(4, 40)).toBe(40);
    expect(placeAbove(3, 40)).toBe(51);
    expect(placeAbove(2, 52)).toBe(62);
  });
});

describe('trechos de acorde', () => {
  it('meio compasso no 4/4; compasso inteiro na anacruse, no 3/4 e no último compasso curto', () => {
    const song: Song = {
      ...ODE,
      timeSignature: { beats: 3, unit: 4 },
      measures: [
        { beats: 1, notes: [n(0, 1, 62, 1, 0)] },
        { beats: 3, notes: [n(0, 3, 66, 1, 2)] },
        { beats: 2, notes: [n(0, 2, 62, 1, 0)] },
      ],
    };
    expect(chordSpans(song)).toEqual([
      { beat: 0, beats: 1, downbeat: true },
      { beat: 1, beats: 3, downbeat: true },
      { beat: 4, beats: 2, downbeat: true },
    ]);
    expect(chordSpans(ODE).slice(0, 3)).toEqual([
      { beat: 0, beats: 2, downbeat: true },
      { beat: 2, beats: 2, downbeat: false },
      { beat: 4, beats: 2, downbeat: true },
    ]);
  });
});

describe('clashes', () => {
  const melody = [{ at: 1, beats: 1, midi: 66 }];
  it('bate na mesma nota e a uma oitava, só enquanto as duas soam juntas', () => {
    expect(clashes(66, 0.5, 1, melody)).toBe(true);
    expect(clashes(54, 1.5, 1, melody)).toBe(true);
    expect(clashes(78, 0, 4, melody)).toBe(true);
    expect(clashes(42, 1, 1, melody)).toBe(false);
    expect(clashes(64, 1, 1, melody)).toBe(false);
    expect(clashes(66, 0, 1, melody)).toBe(false);
    expect(clashes(66, 2, 1, melody)).toBe(false);
  });
});

describe.each(FIXED_SONGS.map((entry) => [entry.id, entry.song] as const))('acompanhamento de %s', (_id, song) => {
  const full = arrange(song, { avoidMelody: false });
  const arrangement = arrange(song);
  const melody = timeline(song);

  it('em Ré maior, com acordes contíguos cobrindo a música inteira e terminando em I', () => {
    expect(arrangement.key).toEqual({ tonic: D, mode: 'major' });
    expect(arrangement.chords).toEqual(full.chords);
    let at = 0;
    for (const chord of arrangement.chords) {
      expect(chord.beat).toBeCloseTo(at, 9);
      at += chord.beats;
    }
    expect(at).toBeCloseTo(songDurationBeats(song), 9);
    expect(arrangement.chords.at(-1)?.degree).toBe('I');
  });

  it('só Ré, Sol e Lá maiores, e a nota da melodia no começo de cada acorde é nota do acorde', () => {
    for (const chord of arrangement.chords) {
      expect([D, G, A]).toContain(chord.pitchClasses[0]);
      const first = melody.find((note) => Math.abs(note.at - chord.beat) < 1e-9);
      if (first) expect(chord.pitchClasses).toContain(first.midi % 12);
    }
  });

  it('com fone (completa): baixo na fundamental, tríade inteira, arpejo em colcheias, metais em fundamental e quinta, um toque de tímpano por acorde', () => {
    const { bass, pad, arpeggio, brass, timpani } = full.parts;
    expect(bass).toHaveLength(full.chords.length);
    expect(pad).toHaveLength(full.chords.length * 3);
    full.chords.forEach((chord, i) => {
      expect(bass[i]).toMatchObject({ beat: chord.beat, beats: chord.beats });
      expect(bass[i].midi % 12).toBe(chord.pitchClasses[0]);
      const tones = pad.filter((note) => note.beat === chord.beat).map((note) => note.midi % 12);
      expect(tones.sort()).toEqual([...chord.pitchClasses].sort());
      const inside = arpeggio.filter((note) => note.beat >= chord.beat - 1e-9 && note.beat < chord.beat + chord.beats - 1e-9);
      expect(inside).toHaveLength(Math.round(chord.beats * 2));
      const [root, fifth] = brass.filter((note) => note.beat === chord.beat);
      expect(fifth.midi - root.midi).toBe(7);
      expect(root.midi % 12).toBe(chord.pitchClasses[0]);
      const hit = timpani.filter((note) => note.beat === chord.beat);
      expect(hit).toHaveLength(1);
      expect(hit[0].velocity).toBe(chord.downbeat ? 1 : 0.6);
    });
  });

  it('sem fone: nenhuma nota da orquestra soa junto com a nota esperada nem a uma oitava dela', () => {
    for (const part of PARTS) {
      for (const note of arrangement.parts[part]) {
        expect(clashes(note.midi, note.beat, note.beats, melody), `${part} ${note.midi} no tempo ${note.beat}`).toBe(false);
      }
    }
  });

  it('sem fone: só notas do acorde do trecho, no registro médio, e a maior parte da orquestra continua tocando', () => {
    for (const part of PARTS) {
      for (const note of arrangement.parts[part]) {
        const chord = arrangement.chords.find((c) => note.beat >= c.beat - 1e-9 && note.beat < c.beat + c.beats - 1e-9)!;
        expect(chord.pitchClasses).toContain(note.midi % 12);
        expect(note.midi).toBeGreaterThanOrEqual(LOWEST_ORCHESTRA_MIDI);
        expect(note.midi).toBeLessThanOrEqual(HIGHEST_ORCHESTRA_MIDI + 12);
      }
    }
    const count = (a: typeof full) => PARTS.reduce((total, part) => total + a.parts[part].length, 0);
    expect(count(arrangement) / count(full)).toBeGreaterThan(0.75);
  });

  it('registro médio: baixo a partir do Mi2 e acordes do Mi3 ao Ré♯4 quando nada bate', () => {
    for (const note of full.parts.bass) expect(note.midi).toBeGreaterThanOrEqual(BASS_FLOOR);
    for (const note of full.parts.pad) {
      expect(note.midi).toBeGreaterThanOrEqual(CHORD_FLOOR);
      expect(note.midi).toBeLessThanOrEqual(HIGHEST_ORCHESTRA_MIDI);
    }
  });
});

it('Brilha, Brilha, Estrelinha ganha a harmonia clássica: I I IV I IV I V I nos dois primeiros compassos', () => {
  const song = findFixedSong('brilha-brilha-estrelinha')!.song;
  expect(arrange(song).chords.slice(0, 8).map((chord) => chord.degree)).toEqual(['I', 'I', 'IV', 'I', 'IV', 'I', 'V', 'I']);
});

it('uma nota que bate com a melodia desce uma oitava; sem saída, sai', () => {
  const song: Song = { ...ODE, measures: [{ beats: 2, notes: [n(0, 2, 62, 1, 0)] }] };
  const { parts } = arrange(song);
  expect(parts.bass.map((note) => note.midi)).toEqual([38]);
  expect(parts.pad.map((note) => note.midi)).toEqual([54, 57]);
});
