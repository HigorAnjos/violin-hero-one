import { describe, it, expect } from 'vitest';
import { attacks, parseSong, songDurationBeats, songDurationSeconds, songProblems, timeline, type Song, type SongNote } from './song';
import { DEFAULT_A4, midiToFrequency, stringFits } from './violin';

const n = (beat: number, beats: number, midi: number, string: SongNote['string'], finger: SongNote['finger'], tie?: boolean): SongNote =>
  tie ? { beat, beats, midi, string, finger, tie } : { beat, beats, midi, string, finger };

/** Ode à Alegria, 4 primeiros compassos, Ré maior: F# F# G A | A G F# E | D D E F# | F#. E E */
const ODE: Song = {
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
    { beats: 4, notes: [n(0, 1.5, 78, 3, 1), n(1.5, 0.5, 76, 3, 0), n(2, 2, 76, 3, 0)] },
  ],
};

const withMeasures = (measures: Song['measures'], extra: Partial<Song> = {}): Song => ({ ...ODE, ...extra, measures });

describe('violino', () => {
  it('Lá padrão 442 Hz e afinação temperada', () => {
    expect(DEFAULT_A4).toBe(442);
    expect(midiToFrequency(69)).toBe(442);
    expect(midiToFrequency(81, 440)).toBeCloseTo(880, 6);
    expect(midiToFrequency(55, 440)).toBeCloseTo(196, 1);
  });

  it('cada corda vai da solta até a oitava (3ª posição)', () => {
    expect(stringFits(55, 0)).toBe(true);
    expect(stringFits(67, 0)).toBe(true);
    expect(stringFits(68, 0)).toBe(false);
    expect(stringFits(61, 1)).toBe(false);
  });
});

describe('modelo Song', () => {
  it('música válida não tem problemas', () => {
    expect(songProblems(ODE)).toEqual([]);
  });

  it('duração soma os compassos, inclusive a anacruse', () => {
    expect(songDurationBeats(ODE)).toBe(16);
    expect(songDurationSeconds(ODE)).toBeCloseTo(9.6, 6);
    const pickup = withMeasures([{ beats: 1, notes: [n(0, 1, 69, 2, 0)] }, ...ODE.measures]);
    expect(songProblems(pickup)).toEqual([]);
    expect(songDurationBeats(pickup)).toBe(17);
  });

  it('timeline põe cada nota no tempo absoluto, com compasso e índice', () => {
    const t = timeline(ODE);
    expect(t).toHaveLength(15);
    expect(t[4]).toMatchObject({ measure: 1, index: 4, at: 4, midi: 81 });
    expect(t[13]).toMatchObject({ measure: 3, at: 13.5, beats: 0.5 });
  });

  it('nota ligada continua a anterior e não pede novo ataque', () => {
    const tied = withMeasures([
      { beats: 4, notes: [n(0, 2, 69, 2, 0), n(2, 2, 71, 2, 1)] },
      { beats: 4, notes: [n(0, 2, 71, 2, 1, true), n(2, 2, 69, 2, 0)] },
    ]);
    expect(songProblems(tied)).toEqual([]);
    expect(attacks(tied).map((x) => x.at)).toEqual([0, 2, 6]);
  });

  it.each([
    ['nota que passa do compasso', withMeasures([{ beats: 4, notes: [n(3, 2, 69, 2, 0)] }]), 'passa do fim'],
    ['notas sobrepostas', withMeasures([{ beats: 4, notes: [n(0, 2, 69, 2, 0), n(1, 1, 71, 2, 1)] }]), 'antes da anterior'],
    ['nota fora da corda', withMeasures([{ beats: 4, notes: [n(0, 1, 60, 1, 1)] }]), 'não cabe na corda'],
    ['acima da 3ª posição', withMeasures([{ beats: 4, notes: [n(0, 1, 90, 3, 4)] }]), 'fora do violino'],
    ['dedo em corda solta', withMeasures([{ beats: 4, notes: [n(0, 1, 69, 2, 1)] }]), 'corda solta'],
    ['corda presa sem dedo', withMeasures([{ beats: 4, notes: [n(0, 1, 71, 2, 0)] }]), 'corda solta'],
    ['ligadura com nota diferente', withMeasures([{ beats: 4, notes: [n(0, 1, 69, 2, 0), n(1, 1, 71, 2, 1, true)] }]), 'ligadura'],
    ['ligadura com pausa no meio', withMeasures([{ beats: 4, notes: [n(0, 1, 69, 2, 0), n(2, 1, 69, 2, 0, true)] }]), 'ligadura'],
    ['compasso maior que a fórmula', withMeasures([{ beats: 5, notes: [n(0, 1, 69, 2, 0)] }]), 'duração inválida'],
    ['sem notas', withMeasures([{ beats: 4, notes: [] }]), 'sem notas'],
    ['bpm zero', withMeasures(ODE.measures, { bpm: 0 }), 'bpm'],
    ['nível desconhecido', withMeasures(ODE.measures, { level: 'insane' as Song['level'] }), 'nível'],
    ['formato futuro', withMeasures(ODE.measures, { formatVersion: 2 as 1 }), 'formato'],
  ])('acusa %s', (_label, song, expected) => {
    expect(songProblems(song).join(' | ')).toContain(expected);
  });

  it('parseSong aceita o JSON do banco e devolve igual', () => {
    const fromDb = JSON.parse(JSON.stringify(ODE));
    expect(parseSong(fromDb)).toEqual(ODE);
  });

  it('parseSong recusa lixo com todos os problemas na mensagem', () => {
    expect(() => parseSong(null)).toThrow(TypeError);
    expect(() => parseSong({ ...ODE, bpm: 'rápido', level: 'x' })).toThrow(/bpm inválido.*nível inválido/);
  });
});
