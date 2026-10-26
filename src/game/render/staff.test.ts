import { describe, it, expect } from 'vitest';
import { ODE, n } from '../engine/testing';
import type { Song } from '../notation/song';
import type { Measure, TimeSignature } from '../notation/song';
import {
  clock,
  diatonicStep,
  keyAlteration,
  keyFifths,
  keySignature,
  ledgerSteps,
  measureAt,
  measureRests,
  noteShape,
  spell,
  staffLayout,
  stepY,
} from './staff';

/** Pausas do compasso como "figura@tempo" (figura em semínimas, "." na pontuada), das notas [início, duração]. */
function rests(time: TimeSignature, beats: number, notes: [number, number][], pickup = false): string[] {
  const measure: Measure = { beats, notes: notes.map(([beat, length]) => n(beat, length, 69, 2, 0)) };
  return measureRests(measure, time, pickup).map((r) => `${r.value}${r.dotted ? '.' : ''}@${r.beat}`);
}

const FOUR = { beats: 4, unit: 4 } as const;
const THREE = { beats: 3, unit: 4 } as const;
const SIX_EIGHT = { beats: 6, unit: 8 } as const;

describe('pausas derivadas do vão', () => {
  it('compasso inteiro vazio é a pausa de semibreve, em qualquer métrica', () => {
    expect(rests(FOUR, 4, [])).toEqual(['4@0']);
    expect(rests(THREE, 3, [])).toEqual(['4@0']);
    expect(rests({ beats: 2, unit: 4 }, 2, [])).toEqual(['4@0']);
    expect(rests(SIX_EIGHT, 6, [])).toEqual(['4@0']);
  });

  it('4/4: a mínima só no 1º ou no 3º tempo, sem atravessar o meio do compasso', () => {
    expect(rests(FOUR, 4, [[0, 1]])).toEqual(['1@1', '2@2']);
    expect(rests(FOUR, 4, [[0, 2]])).toEqual(['2@2']);
    expect(rests(FOUR, 4, [[3, 1]])).toEqual(['2@0', '1@2']);
    expect(rests(FOUR, 4, [[1, 1], [3, 1]])).toEqual(['1@0', '1@2']);
    expect(rests(FOUR, 4, [[0, 1], [3, 1]])).toEqual(['1@1', '1@2']);
  });

  it('4/4: colcheia e semicolcheia dentro do tempo, alinhadas ao próprio valor', () => {
    expect(rests(FOUR, 4, [[0, 0.5], [2, 2]])).toEqual(['0.5@0.5', '1@1']);
    expect(rests(FOUR, 4, [[0, 0.25], [1, 3]])).toEqual(['0.25@0.25', '0.5@0.5']);
    expect(rests(FOUR, 4, [[0, 1.5], [2, 2]])).toEqual(['0.5@1.5']);
    expect(rests(FOUR, 4, [[0, 3.5]])).toEqual(['0.5@3.5']);
  });

  it('pontuadas: colcheia pontuada no começo do tempo; semínima e mínima pontuadas no 6/8 e no 12/8', () => {
    expect(rests(FOUR, 4, [[0.75, 3.25]])).toEqual(['0.5.@0']);
    expect(rests(FOUR, 4, [[0.25, 0.25], [1, 3]])).toEqual(['0.25@0', '0.5@0.5']);
    // 6/8: o tempo é a semínima pontuada (três colcheias)
    expect(rests(SIX_EIGHT, 6, [[0, 3]])).toEqual(['1.@3']);
    expect(rests(SIX_EIGHT, 6, [[0, 1], [3, 3]])).toEqual(['0.5@1', '0.5@2']);
    expect(rests({ beats: 12, unit: 8 }, 12, [[0, 6]])).toEqual(['2.@6']);
  });

  it('3/4: mínima nos dois primeiros tempos; nos dois últimos, duas semínimas', () => {
    expect(rests(THREE, 3, [[2, 1]])).toEqual(['2@0']);
    expect(rests(THREE, 3, [[0, 1]])).toEqual(['1@1', '1@2']);
    expect(rests(THREE, 3, [[0, 0.5], [2, 1]])).toEqual(['0.5@0.5', '1@1']);
  });

  it('anacruse: o compasso curto é o fim de um inteiro, e a pausa segue os tempos dele', () => {
    // 4/4 com anacruse de 3 tempos (2º ao 4º): a pausa dos tempos 2–3 não vira mínima
    expect(rests(FOUR, 3, [[2, 1]], true)).toEqual(['1@0', '1@1']);
    expect(rests(FOUR, 3, [[2, 1]])).toEqual(['2@0']);
    // 3/4 com anacruse de 1 tempo e meio: colcheia no meio do 2º tempo
    expect(rests(THREE, 1.5, [[0.5, 1]], true)).toEqual(['0.5@0']);
    expect(rests(THREE, 1, [[0, 1]], true)).toEqual([]);
  });

  it('o que nenhuma figura escreve (quiáltera) fica sem pausa, e o resto segue', () => {
    expect(rests(FOUR, 4, [[0, 1 / 3], [2, 2]])).toEqual(['0.5@0.5', '1@1']);
  });

  it('na música: pausas no tempo absoluto, e a anacruse só no primeiro compasso', () => {
    const song: Song = {
      ...ODE,
      timeSignature: THREE,
      measures: [
        { beats: 1, notes: [n(0, 1, 69, 2, 0)] },
        { beats: 3, notes: [n(0, 1, 71, 2, 1)] },
        { beats: 3, notes: [] },
        { beats: 2, notes: [n(0, 1, 74, 2, 3)] },
      ],
    };
    expect(staffLayout(song).rests.map((r) => [r.measure, r.at, r.value, r.dotted])).toEqual([
      [1, 2, 1, false],
      [1, 3, 1, false],
      [2, 4, 4, false],
      [3, 8, 1, false],
    ]);
  });
});

describe('pauta', () => {
  it('armadura pela tonalidade', () => {
    expect(keyFifths('D major')).toBe(2);
    expect(keyFifths('B minor')).toBe(2);
    expect(keyFifths('F major')).toBe(-1);
    expect(keyFifths('xyz')).toBe(0);
    expect(keySignature(2)).toEqual([
      { step: 38, glyph: '♯' },
      { step: 35, glyph: '♯' },
    ]);
  });

  it('posição na clave de sol: Mi4 na linha de baixo, Fá♯5 na de cima', () => {
    expect(stepY(diatonicStep(64, 2))).toBe(72);
    expect(stepY(diatonicStep(78, 2))).toBe(32);
    expect(diatonicStep(66, 2)).toBe(diatonicStep(65, 2));
    expect(diatonicStep(70, -1)).toBe(diatonicStep(71, -1));
  });

  it('linhas suplementares para o Sol3 da corda solta e acima da pauta', () => {
    expect(ledgerSteps(diatonicStep(55, 2))).toEqual([28, 26]);
    expect(ledgerSteps(diatonicStep(81, 2))).toEqual([40]);
    expect(ledgerSteps(diatonicStep(69, 2))).toEqual([]);
  });

  it('layout da música: compassos, notas e haste', () => {
    const layout = staffLayout(ODE);
    expect(layout.bars).toEqual([0, 4, 8, 12]);
    expect(layout.totalBeats).toBe(16);
    expect(layout.notes).toHaveLength(16);
    expect(layout.notes[0]).toMatchObject({ at: 0, stemUp: false, string: 3, finger: 1 });
    expect(layout.notes[15].tie).toBe(true);
    expect(measureAt(layout.bars, 9.5)).toBe(2);
  });

  it('grafia na tonalidade: sustenido em Ré maior, bemol em Fá maior', () => {
    expect(spell(66, 2)).toMatchObject({ name: 'Fá♯4', alteration: 1 });
    expect(spell(73, 2).name).toBe('Dó♯5');
    expect(spell(70, -1)).toMatchObject({ name: 'Si♭4', alteration: -1 });
    expect(spell(55, 0).name).toBe('Sol3');
    expect(keyAlteration(3, 2)).toBe(1);
    expect(keyAlteration(4, 2)).toBe(0);
    expect(keyAlteration(6, -1)).toBe(-1);
  });

  it('acidente só fora da armadura, e vale até o fim do compasso', () => {
    const song: Song = {
      ...ODE,
      measures: [
        { beats: 4, notes: [n(0, 1, 66, 1, 2), n(1, 1, 65, 1, 2), n(2, 1, 65, 1, 2), n(3, 1, 66, 1, 2)] },
        { beats: 4, notes: [n(0, 1, 65, 1, 2), n(1, 2, 72, 2, 2), n(3, 1, 72, 2, 2, true)] },
      ],
    };
    expect(staffLayout(song).notes.map((x) => x.accidental)).toEqual([null, '♮', null, '♯', '♮', '♮', null]);
  });

  it('figura pela duração em semínimas, também em compasso de colcheia', () => {
    expect(noteShape(4)).toEqual({ hollow: true, stem: false, flags: 0, dotted: false });
    expect(noteShape(3)).toEqual({ hollow: true, stem: true, flags: 0, dotted: true });
    expect(noteShape(1)).toEqual({ hollow: false, stem: true, flags: 0, dotted: false });
    expect(noteShape(1.5).dotted).toBe(true);
    expect(noteShape(0.5)).toMatchObject({ flags: 1, dotted: false });
    expect(noteShape(0.25)).toMatchObject({ flags: 2 });
    const sixEight: Song = { ...ODE, timeSignature: { beats: 6, unit: 8 }, measures: [{ beats: 6, notes: [n(0, 3, 69, 2, 0), n(3, 1, 71, 2, 1)] }] };
    expect(staffLayout(sixEight).notes.map((x) => [x.flags, x.dotted])).toEqual([
      [0, true],
      [1, false],
    ]);
  });

  it('ligaduras: dentro do compasso e atravessando a barra, do lado contrário à haste', () => {
    const song: Song = {
      ...ODE,
      measures: [
        { beats: 4, notes: [n(0, 1.5, 81, 3, 3), n(1.5, 0.5, 81, 3, 3, true), n(2, 2, 69, 2, 0)] },
        { beats: 4, notes: [n(0, 1, 69, 2, 0, true), n(1, 1, 69, 2, 0, true), n(2, 2, 71, 2, 1)] },
      ],
    };
    const { ties } = staffLayout(song);
    expect(ties).toEqual([
      { from: 0, to: 1, fromAt: 0, toAt: 1.5, step: 40, below: false, dotted: true },
      { from: 2, to: 3, fromAt: 2, toAt: 4, step: 33, below: true, dotted: false },
      { from: 3, to: 4, fromAt: 4, toAt: 5, step: 33, below: true, dotted: false },
    ]);
    expect(staffLayout(ODE).ties).toMatchObject([{ from: 14, to: 15, fromAt: 14, toAt: 15 }]);
  });

  it('relógio m:ss', () => {
    expect(clock(102.7)).toBe('1:42');
    expect(clock(-3)).toBe('0:00');
  });
});
