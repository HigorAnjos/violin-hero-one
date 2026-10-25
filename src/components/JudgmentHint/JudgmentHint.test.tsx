import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { NoteJudgment } from '../../game/engine/types';
import { renderScreen } from '../../shell/testing';
import { comboLine, explainJudgment, likelyString, placeOf, type TargetNote } from './explain';
import { JudgmentHint } from './JudgmentHint';

const RE5_ON_A: TargetNote = { midi: 74, string: 2, finger: 3 };

const judgment = (extra: Partial<NoteJudgment>): NoteJudgment => ({
  index: 4,
  noteIndex: 4,
  measure: 1,
  string: 2,
  midi: 74,
  judgment: 'good',
  issue: null,
  offsetMs: 0,
  cents: 0,
  playedMidi: null,
  points: 40,
  ...extra,
});

const text = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

describe('explainJudgment', () => {
  it('Perfeito não tem o que explicar', () => {
    expect(explainJudgment(judgment({ judgment: 'perfect' }), RE5_ON_A)).toBeNull();
  });

  it('nota errada: o que tocou, em que corda, e o alvo', () => {
    const e = explainJudgment(judgment({ judgment: 'miss', issue: 'wrong-note', playedMidi: 76 }), RE5_ON_A)!;
    expect(e.chip).toBe('NOTA ERRADA');
    expect(text(e.hint)).toBe('Você tocou Mi5, corda Mi solta. O alvo era Ré5: corda Lá, 3º dedo.');
    expect(e.playedString).toBe(3);
    expect(e.ruler).toBeNull();
  });

  it('atrasada: ms, dica do arco, latência já descontada e régua', () => {
    const e = explainJudgment(judgment({ issue: 'late', offsetMs: 84 }), RE5_ON_A, 142)!;
    expect(e.chip).toBe('TARDE ▸ +84 MS');
    expect(text(e.hint)).toBe('Nota e afinação certas, mas 84 ms atrasada. Comece o arco um pouco antes da linha.');
    expect(e.note).toBe('Já descontados 142 ms de latência do seu aparelho.');
    expect(e.ruler?.at).toBeCloseTo(50 + (84 / 220) * 50, 5);
    expect(e.ruler?.label).toBe('Tempo: 84 milissegundos atrasado');
  });

  it('desafinada: para onde mexer o dedo; corda solta pede afinar', () => {
    const sharp = explainJudgment(judgment({ issue: 'sharp', cents: 38 }), RE5_ON_A)!;
    expect(text(sharp.hint)).toBe('Nota e tempo certos, mas 38 ¢ alta. Recue o 3º dedo um pouco, em direção à voluta.');
    expect(sharp.chip).toBe('ALTO ▴ +38 ¢');
    const flatOpen = explainJudgment(judgment({ issue: 'flat', cents: -30, midi: 69 }), { midi: 69, string: 2, finger: 0 })!;
    expect(text(flatOpen.hint)).toBe('Nota e tempo certos, mas 30 ¢ baixa. Confira a afinação da corda Lá.');
  });

  it('não tocada', () => {
    const e = explainJudgment(judgment({ judgment: 'miss', issue: 'not-played', offsetMs: null, cents: null }), RE5_ON_A)!;
    expect(text(e.hint)).toBe('Não ouvimos a nota Ré5: corda Lá, 3º dedo.');
  });
});

describe('ajudantes', () => {
  it('onde fica a nota', () => {
    expect(placeOf(3, 0)).toBe('corda Mi solta');
    expect(placeOf(2, 3)).toBe('corda Lá, 3º dedo');
    expect(likelyString(76)).toBe(3);
    expect(likelyString(60)).toBe(0);
  });

  it('linha do combo', () => {
    expect(comboLine(judgment({ judgment: 'miss', points: 0 }), 128, 0, 1)).toEqual({ lost: 'COMBO 128', text: '→ 0 · ×1' });
    expect(comboLine(judgment({ points: 50 }), 128, 129, 4)).toEqual({ lost: null, text: 'COMBO 129 · +50' });
  });
});

describe('JudgmentHint', () => {
  it('mostra o motivo, a régua e a dica, anunciados com educação', () => {
    const e = explainJudgment(judgment({ issue: 'late', offsetMs: 84 }), RE5_ON_A, 142)!;
    renderScreen(<JudgmentHint explanation={e} />);
    expect(screen.getByRole('status')).toHaveTextContent('TARDE ▸ +84 MS');
    expect(screen.getByRole('img', { name: 'Tempo: 84 milissegundos atrasado' })).toBeInTheDocument();
    expect(screen.getByText('84 ms atrasada')).toBeInTheDocument();
  });

  it('compacto (celular): só chip e dica', () => {
    const e = explainJudgment(judgment({ issue: 'late', offsetMs: 84 }), RE5_ON_A, 142)!;
    renderScreen(<JudgmentHint explanation={e} compact />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/Já descontados/)).not.toBeInTheDocument();
  });
});
