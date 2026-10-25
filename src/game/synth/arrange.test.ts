import { describe, expect, it } from 'vitest';
import { ODE, n } from '../engine/testing';
import { songDurationBeats, timeline, type Song } from '../notation/song';
import { FIXED_SONGS, findFixedSong } from '../notation/songs';
import { LOWEST_MIDI, MAX_A4, midiToFrequency } from '../notation/violin';
import { HIGH_PASS_HZ } from '../audio/pitch/constants';
import { BASS_FLOOR, CHORD_FLOOR, HIGHEST_ORCHESTRA_MIDI, PARTS, arrange, chordSpans, parseKey, placeAbove, triad } from './arrange';

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
    expect(placeAbove(2, 28)).toBe(38);
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

describe.each(FIXED_SONGS.map((entry) => [entry.id, entry.song] as const))('acompanhamento de %s', (_id, song) => {
  const arrangement = arrange(song);
  const melody = timeline(song);

  it('em Ré maior, com acordes contíguos cobrindo a música inteira e terminando em I', () => {
    expect(arrangement.key).toEqual({ tonic: D, mode: 'major' });
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

  it('cordas: baixo na fundamental e a tríade inteira, no ritmo dos acordes', () => {
    const { bass, pad } = arrangement.parts;
    expect(bass).toHaveLength(arrangement.chords.length);
    expect(pad).toHaveLength(arrangement.chords.length * 3);
    arrangement.chords.forEach((chord, i) => {
      expect(bass[i]).toMatchObject({ beat: chord.beat, beats: chord.beats });
      expect(bass[i].midi % 12).toBe(chord.pitchClasses[0]);
      const tones = pad.filter((note) => note.beat === chord.beat).map((note) => note.midi % 12);
      expect(tones.sort()).toEqual([...chord.pitchClasses].sort());
    });
  });

  it('madeiras: arpejo em colcheias com notas do acorde; metais: fundamental e quinta; percussão: um toque por acorde', () => {
    const { arpeggio, brass, timpani } = arrangement.parts;
    for (const chord of arrangement.chords) {
      const inside = arpeggio.filter((note) => note.beat >= chord.beat - 1e-9 && note.beat < chord.beat + chord.beats - 1e-9);
      expect(inside).toHaveLength(Math.round(chord.beats * 2));
      for (const note of inside) expect(chord.pitchClasses).toContain(note.midi % 12);
      const [root, fifth] = brass.filter((note) => note.beat === chord.beat);
      expect(fifth.midi - root.midi).toBe(7);
      expect(root.midi % 12).toBe(chord.pitchClasses[0]);
      const hit = timpani.filter((note) => note.beat === chord.beat);
      expect(hit).toHaveLength(1);
      expect(hit[0].velocity).toBe(chord.downbeat ? 1 : 0.6);
    }
  });

  it('a orquestra inteira fica abaixo do passa-alta de 170 Hz do Ouvido, mesmo no Lá mais alto, e uma quarta abaixo do Sol3', () => {
    for (const part of PARTS) {
      for (const note of arrangement.parts[part]) {
        expect(note.midi).toBeGreaterThanOrEqual(BASS_FLOOR);
        expect(note.midi).toBeLessThanOrEqual(HIGHEST_ORCHESTRA_MIDI);
        expect(note.midi).toBeLessThanOrEqual(LOWEST_MIDI - 4);
        expect(midiToFrequency(note.midi, MAX_A4)).toBeLessThan(HIGH_PASS_HZ);
      }
    }
    for (const note of arrangement.parts.pad) expect(note.midi).toBeGreaterThanOrEqual(CHORD_FLOOR);
  });
});

it('Brilha, Brilha, Estrelinha ganha a harmonia clássica: I I IV I IV I V I nos dois primeiros compassos', () => {
  const song = findFixedSong('brilha-brilha-estrelinha')!.song;
  expect(arrange(song).chords.slice(0, 8).map((chord) => chord.degree)).toEqual(['I', 'I', 'IV', 'I', 'IV', 'I', 'V', 'I']);
});
