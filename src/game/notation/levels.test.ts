import { describe, it, expect } from 'vitest';
import { keyName, LEVEL_RULES, levelChart, levelShift, simplifyRhythm, transposeKey } from './levels';
import type { Score, ScoreMeasure } from './musicxml';
import { attacks, timeline } from './song';

const score = (measures: ScoreMeasure[], key: Score['key'] = { fifths: 2, mode: 'major' }): Score => ({
  title: 'Teste',
  composer: '',
  key,
  bpm: 90,
  timeSignature: { beats: 4, unit: 4 },
  measures,
});
const n = (beat: number, beats: number, midi: number, tie?: boolean) => (tie ? { beat, beats, midi, tie } : { beat, beats, midi });

describe('tonalidade', () => {
  it('keyName escreve como Song.key', () => {
    expect(keyName({ fifths: 2, mode: 'major' })).toBe('D major');
    expect(keyName({ fifths: -1, mode: 'major' })).toBe('F major');
    expect(keyName({ fifths: 0, mode: 'minor' })).toBe('A minor');
    expect(keyName({ fifths: 3, mode: 'minor' })).toBe('F# minor');
  });

  it('transposeKey anda de quintas: Fá + 2 semitons = Sol', () => {
    expect(transposeKey({ fifths: -1, mode: 'major' }, 2)).toEqual({ fifths: 1, mode: 'major' });
    expect(transposeKey({ fifths: 2, mode: 'major' }, -12)).toEqual({ fifths: 2, mode: 'major' });
    expect(transposeKey({ fifths: 0, mode: 'minor' }, 1)).toEqual({ fifths: -5, mode: 'minor' });
  });
});

describe('levelShift', () => {
  const fMajor = score([{ beats: 4, notes: [n(0, 1, 65), n(1, 1, 60), n(2, 2, 72)] }], { fifths: -1, mode: 'major' });

  it('Fácil leva Fá maior para Sol maior (o tom confortável mais perto)', () => {
    expect(levelShift(fMajor, LEVEL_RULES.easy)).toBe(2);
    expect(levelChart(fMajor, 'x', 'easy').key).toBe('G major');
  });

  it('Médio e Difícil mantêm a tonalidade da partitura', () => {
    expect(levelShift(fMajor, LEVEL_RULES.medium)).toBe(0);
    expect(levelChart(fMajor, 'x', 'hard').key).toBe('F major');
  });

  it('Fácil desce o que passa da 1ª posição; Difícil toca até a 3ª', () => {
    const high = score([{ beats: 4, notes: [n(0, 1, 81), n(1, 1, 86), n(2, 2, 78)] }]);
    expect(levelShift(high, LEVEL_RULES.easy)).toBe(-12);
    expect(levelShift(high, LEVEL_RULES.hard)).toBe(0);
    expect(timeline(levelChart(high, 'x', 'easy')).map((x) => x.midi)).toEqual([69, 74, 66]);
  });

  it('melodia grave demais para qualquer nível lança', () => {
    const low = score([{ beats: 4, notes: [n(0, 1, 50), n(1, 1, 80)] }]);
    expect(() => levelShift(low, LEVEL_RULES.hard)).toThrow(/não cabe/);
  });
});

describe('simplifyRhythm', () => {
  it('sem grade só junta a ligadura dentro do compasso', () => {
    const out = simplifyRhythm([{ beats: 4, notes: [n(0, 1.5, 69), n(1.5, 0.5, 69, true), n(2, 2, 71)] }], null);
    expect(out[0].notes).toEqual([n(0, 2, 69), n(2, 2, 71)]);
  });

  it('grade de colcheia: semicolcheias somem e pontuada + semicolcheia vira duas colcheias', () => {
    const out = simplifyRhythm(
      [{ beats: 4, notes: [n(0, 0.75, 74), n(0.75, 0.25, 76), n(1, 0.25, 78), n(1.25, 0.25, 76), n(1.5, 0.5, 74), n(2, 2, 69)] }],
      0.5,
    );
    expect(out[0].notes).toEqual([n(0, 0.5, 74), n(0.5, 0.5, 76), n(1, 0.5, 78), n(1.5, 0.5, 74), n(2, 2, 69)]);
  });

  it('pausa continua pausa', () => {
    const out = simplifyRhythm([{ beats: 4, notes: [n(1, 0.25, 62), n(3, 1, 64)] }], 0.5);
    expect(out[0].notes).toEqual([n(1, 0.25, 62), n(3, 1, 64)]);
  });

  it('ligadura entre compassos fica; perde o tie se a nota de antes sumiu na grade', () => {
    const kept = simplifyRhythm([{ beats: 4, notes: [n(0, 2, 62), n(2, 2, 69)] }, { beats: 4, notes: [n(0, 4, 69, true)] }], 0.5);
    expect(kept[1].notes[0].tie).toBe(true);
    const lost = simplifyRhythm([{ beats: 4, notes: [n(0, 3.5, 62), n(3.5, 0.25, 64), n(3.75, 0.25, 69)] }, { beats: 4, notes: [n(0, 4, 69, true)] }], 0.5);
    expect(lost[0].notes).toEqual([n(0, 3.5, 62), n(3.5, 0.5, 64)]);
    expect(lost[1].notes[0]).toEqual(n(0, 4, 69));
  });
});

describe('levelChart', () => {
  const melody = score([
    { beats: 4, notes: [n(0, 0.75, 74), n(0.75, 0.25, 76), n(1, 1, 69), n(2, 2, 74)] },
    { beats: 4, notes: [n(0, 4, 74, true)] },
  ]);

  it('os 3 níveis passam pelo parseSong com o mesmo tamanho e o nível certo', () => {
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const song = levelChart(melody, 'teste', level);
      expect(song).toMatchObject({ id: 'teste', level, formatVersion: 1, bpm: 90 });
      expect(song.measures.map((m) => m.beats)).toEqual([4, 4]);
    }
  });

  it('Fácil prefere a corda solta; Difícil, o 4º dedo a atravessar de corda', () => {
    const fingers = (level: 'easy' | 'hard') => attacks(levelChart(melody, 'x', level)).map((x) => `${'GDAE'[x.string]}${x.finger}`);
    expect(fingers('easy')).toEqual(['A3', 'E0', 'A0', 'A3']);
    expect(fingers('hard')).toEqual(['A3', 'A4', 'A0', 'A3']);
  });

  it('ligada continua na mesma corda e dedo', () => {
    const [, , , last, tied] = timeline(levelChart(melody, 'x', 'hard'));
    expect(tied).toMatchObject({ tie: true, string: last.string, finger: last.finger });
  });
});
