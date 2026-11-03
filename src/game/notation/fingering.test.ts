import { describe, it, expect } from 'vitest';
import { fingerMelody, placements, playable, type FingeringRules } from './fingering';
import { HIGHEST_MIDI, LOWEST_MIDI, OPEN_STRING_MIDI, stringFits } from './violin';

const FIRST: FingeringRules = { maxPosition: 1, openCost: -3, positionCost: 0, shiftCost: 0, crossCost: 1 };
const THIRD: FingeringRules = { maxPosition: 3, openCost: 0, positionCost: 1, shiftCost: 3, crossCost: 1 };
const melody = (...midis: number[]) => midis.map((midi) => ({ midi }));
const show = (rules: FingeringRules, ...midis: number[]) =>
  fingerMelody(melody(...midis), rules).map((p) => `${'GDAE'[p.string]}${p.finger}`);

describe('placements', () => {
  it('corda solta é dedo 0; o mesmo som pode sair de outra corda com dedo', () => {
    expect(placements(69, 1)).toEqual([
      { string: 1, finger: 4, position: 1 },
      { string: 2, finger: 0, position: 1 },
    ]);
  });

  it('1ª posição vai de Sol3 a Si5; até a 3ª, até Mi6', () => {
    expect(playable(LOWEST_MIDI, 1)).toBe(true);
    expect(playable(LOWEST_MIDI - 1, 3)).toBe(false);
    expect(playable(83, 1)).toBe(true);
    expect(playable(84, 1)).toBe(false);
    expect(playable(HIGHEST_MIDI, 3)).toBe(true);
    expect(playable(HIGHEST_MIDI + 1, 3)).toBe(false);
  });

  it('toda forma cabe na corda e o dedo 0 só aparece na corda solta', () => {
    for (let midi = LOWEST_MIDI; midi <= HIGHEST_MIDI; midi++) {
      for (const p of placements(midi, 3)) {
        expect(stringFits(midi, p.string)).toBe(true);
        expect(p.finger === 0).toBe(midi === OPEN_STRING_MIDI[p.string]);
      }
    }
  });
});

describe('fingerMelody', () => {
  it('1ª posição preferindo corda solta: a escala de Ré sobe pela Ré e pela Lá', () => {
    expect(show(FIRST, 62, 64, 66, 67, 69, 71, 73, 74)).toEqual(['D0', 'D1', 'D2', 'D3', 'A0', 'A1', 'A2', 'A3']);
  });

  it('corda solta ganha mesmo quando obriga a ir e voltar de corda', () => {
    expect(show(FIRST, 74, 76, 69)).toEqual(['A3', 'E0', 'A0']);
  });

  it('sem preferência pela solta, o 4º dedo evita a travessia', () => {
    const noOpen: FingeringRules = { ...FIRST, openCost: 1 };
    expect(show(noOpen, 74, 76, 74)).toEqual(['A3', 'A4', 'A3']);
  });

  it('até a 3ª posição: sobe só quando precisa e não fica trocando de posição', () => {
    expect(fingerMelody(melody(76, 78, 79), THIRD).map((p) => p.position)).toEqual([1, 1, 1]);
    expect(show(THIRD, 83, 85, 86, 85, 83)).toEqual(['E2', 'E3', 'E4', 'E3', 'E2']);
    expect(fingerMelody(melody(83, 85, 86, 85, 83), THIRD).map((p) => p.position)).toEqual([3, 3, 3, 3, 3]);
  });

  it('nota ligada repete corda e dedo da anterior', () => {
    const notes = [{ midi: 69 }, { midi: 69, tie: true }];
    const [a, b] = fingerMelody(notes, { ...FIRST, openCost: 5 });
    expect(b).toEqual(a);
  });

  it('nota fora do alcance lança com o índice', () => {
    expect(() => fingerMelody(melody(62, 84), FIRST)).toThrow(/nota 2 \(midi 84\)/);
  });

  it('melodia vazia não tem dedilhado', () => {
    expect(fingerMelody([], FIRST)).toEqual([]);
  });
});

describe('fingerMelody com dica da partitura', () => {
  const NO_OPEN: FingeringRules = { ...FIRST, openCost: 1 };
  const hinted = (rules: FingeringRules, notes: Parameters<typeof fingerMelody>[0], warn?: (m: string) => void) =>
    fingerMelody(notes, rules, warn).map((p) => `${'GDAE'[p.string]}${p.finger}`);

  it('dica de corda e dedo vence a preferência do nível, até o 4º dedo no lugar da solta na 1ª posição', () => {
    // sem dica, o Fácil prefere o Mi solto
    expect(hinted(FIRST, [{ midi: 74 }, { midi: 76 }, { midi: 74 }])).toEqual(['A3', 'E0', 'A3']);
    expect(hinted(FIRST, [{ midi: 74 }, { midi: 76, hint: { string: 2, finger: 4 } }, { midi: 74 }])).toEqual(['A3', 'A4', 'A3']);
    // e o contrário: Mi solto pedido onde o algoritmo poria o 4º dedo
    expect(hinted(NO_OPEN, [{ midi: 74 }, { midi: 76 }, { midi: 74 }])).toEqual(['A3', 'A4', 'A3']);
    expect(hinted(NO_OPEN, [{ midi: 74 }, { midi: 76, hint: { string: 3, finger: 0 } }, { midi: 74 }])).toEqual(['A3', 'E0', 'A3']);
  });

  it('só a corda ou só o dedo: o que falta o algoritmo escolhe', () => {
    expect(hinted(FIRST, [{ midi: 69, hint: { string: 1 } }])).toEqual(['D4']);
    expect(hinted(FIRST, [{ midi: 69, hint: { finger: 4 } }])).toEqual(['D4']);
    expect(fingerMelody([{ midi: 81, hint: { string: 2 } }], THIRD)[0]).toMatchObject({ string: 2, finger: 4, position: 3 });
  });

  it('dica que não cabe no nível ou no violino é ignorada com aviso, sem erro', () => {
    const warnings: string[] = [];
    const notes = [
      { midi: 81, hint: { string: 2 } }, // Lá5 na corda Lá só a partir da 3ª posição
      { midi: 74, hint: { finger: 1 } }, // Ré5 com o 1º dedo só a partir da 3ª
      { midi: 69, hint: { string: -1 } }, // <string>5</string>
      { midi: 69, hint: { finger: Number.NaN } },
    ];
    expect(hinted(FIRST, notes, (m) => warnings.push(m))).toEqual(hinted(FIRST, notes.map(({ midi }) => ({ midi }))));
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toBe('nota 1 (midi 81): dica corda 2 não cabe até a 1ª posição, ignorada');
  });

  it('nota ligada ignora a dica e repete a anterior', () => {
    const warn = (m: string) => {
      throw new Error(m);
    };
    expect(hinted(FIRST, [{ midi: 69 }, { midi: 69, tie: true, hint: { string: 1, finger: 4 } }], warn)).toEqual(['A0', 'A0']);
  });

  it('dica igual à escolha do algoritmo não muda nada', () => {
    const midis = [62, 64, 66, 67, 69, 71, 73, 74];
    const plain = fingerMelody(melody(...midis), THIRD);
    const notes = plain.map((p, i) => ({ midi: midis[i], hint: { string: p.string, finger: p.finger } }));
    expect(fingerMelody(notes, THIRD)).toEqual(plain);
  });
});
