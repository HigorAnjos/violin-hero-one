import { describe, it, expect } from 'vitest';
import { ODE } from '../engine/testing';
import { clock, diatonicStep, keyFifths, keySignature, ledgerSteps, measureAt, staffLayout, stepY } from './staff';

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

  it('relógio m:ss', () => {
    expect(clock(102.7)).toBe('1:42');
    expect(clock(-3)).toBe('0:00');
  });
});
