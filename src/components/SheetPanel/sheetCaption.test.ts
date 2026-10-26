import { describe, expect, it } from 'vitest';
import { ODE } from '../../game/engine/testing';
import { keyLabel, sheetCaption } from './sheetCaption';

describe('keyLabel', () => {
  it('tonalidade em português, com acidente', () => {
    expect(keyLabel('D major')).toBe('Ré maior');
    expect(keyLabel('F# minor')).toBe('Fá♯ menor');
    expect(keyLabel('Bb major')).toBe('Si♭ maior');
    expect(keyLabel('modal')).toBe('modal');
  });
});

describe('sheetCaption', () => {
  it('tonalidade, compasso e onde está', () => {
    expect(sheetCaption(ODE, 1)).toBe(`Partitura · Ré maior · 4/4 · compasso 2 de ${ODE.measures.length}`);
  });

  it('antes do primeiro tempo, compasso 1; depois do fim, o último', () => {
    expect(sheetCaption(ODE, -1)).toContain('compasso 1 de');
    expect(sheetCaption(ODE, 99)).toContain(`compasso ${ODE.measures.length} de`);
  });
});
