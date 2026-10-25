import { describe, it, expect } from 'vitest';
import { ODE, n } from '../engine/testing';
import type { Song } from '../notation/song';
import { clock, diatonicStep, keyAlteration, keyFifths, keySignature, ledgerSteps, measureAt, noteShape, spell, staffLayout, stepY } from './staff';

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

  it('relógio m:ss', () => {
    expect(clock(102.7)).toBe('1:42');
    expect(clock(-3)).toBe('0:00');
  });
});
