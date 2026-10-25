import { describe, it, expect } from 'vitest';
import { SONG_FORMAT_VERSION, type Song } from '../../game/notation/song';
import { countInView, firstNote, noteName } from './countIn';

const song = (notes: Song['measures'][number]['notes'], bpm = 120): Song => ({
  formatVersion: SONG_FORMAT_VERSION,
  id: 't',
  title: 'T',
  composer: '',
  key: 'D major',
  bpm,
  timeSignature: { beats: 4, unit: 4 },
  level: 'easy',
  measures: [{ beats: 4, notes }],
});

describe('noteName', () => {
  it('nome em português com a oitava', () => {
    expect(noteName(62)).toBe('Ré4');
    expect(noteName(55)).toBe('Sol3');
    expect(noteName(73)).toBe('Dó♯5');
  });
});

describe('countInView', () => {
  const s = song([], 120);

  it('4, 3, 2, 1 no andamento da música; depois acaba', () => {
    expect(countInView(s, 0)).toEqual({ total: 4, beat: 1, remaining: 4, done: false });
    expect(countInView(s, 0.6)).toMatchObject({ beat: 2, remaining: 3 });
    expect(countInView(s, 1.99)).toMatchObject({ beat: 4, remaining: 1, done: false });
    expect(countInView(s, 2)).toMatchObject({ beat: 5, remaining: 0, done: true });
    expect(countInView(s, 99)).toMatchObject({ beat: 5, done: true });
  });

  it('tempo negativo conta como início', () => {
    expect(countInView(s, -1).beat).toBe(1);
  });
});

describe('firstNote', () => {
  it('primeira nota atacada, com corda e dedo', () => {
    expect(firstNote(song([{ beat: 0, beats: 1, midi: 62, string: 1, finger: 0 }]))).toEqual({ name: 'Ré4', where: 'corda Ré solta', string: 1 });
    expect(firstNote(song([{ beat: 1, beats: 1, midi: 73, string: 2, finger: 2 }]))?.where).toBe('corda Lá, dedo médio');
    expect(firstNote(song([]))).toBeNull();
  });
});
