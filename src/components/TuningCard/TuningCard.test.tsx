import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { explainJudgment } from '../JudgmentHint/explain';
import { tracePoints, tuningStatus, TuningCard } from './TuningCard';

const RE5 = { midi: 74, string: 2 as const, finger: 3 as const };

describe('TuningCard', () => {
  it('traço: mais novo na direita, centro é afinado, preso em ±50 ¢', () => {
    expect(tracePoints([{ age: 2, cents: 0 }, { age: 0, cents: 10 }, { age: 0.5, cents: -90 }, { age: 3, cents: 0 }])).toBe('0.0,40.0 264.0,32.0 198.0,80.0');
  });

  it('afinado até ±15 ¢', () => {
    expect(tuningStatus(6)).toEqual({ text: 'Afinado! +6 ¢', tuned: true });
    expect(tuningStatus(-32)).toEqual({ text: 'Baixo · −32 ¢', tuned: false });
  });

  it('mostra a nota da vez, onde tocar e o estado', () => {
    renderScreen(<TuningCard target={RE5} trace={[{ age: 0, cents: 6 }]} liveCents={6} a4={442} explanation={null} />);
    expect(screen.getByText('Ré')).toBeInTheDocument();
    expect(screen.getByText(/corda Lá/)).toHaveTextContent('corda Lá 3º dedo');
    expect(screen.getByText('Afinado! +6 ¢')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Sua afinação nos últimos 2 segundos: afinado' })).toBeInTheDocument();
  });

  it('com erro recente, explica o motivo', () => {
    const explanation = explainJudgment(
      { index: 0, noteIndex: 0, measure: 0, string: 2, midi: 74, judgment: 'miss', issue: 'wrong-note', offsetMs: 0, cents: 0, playedMidi: 76, points: 0 },
      RE5
    );
    renderScreen(<TuningCard target={RE5} trace={[]} liveCents={null} a4={442} explanation={explanation} />);
    expect(screen.getByRole('status')).toHaveTextContent('NOTA ERRADA');
    expect(screen.getByText('Esperando o arco')).toBeInTheDocument();
  });

  it('celular: nota com oitava e frequência', () => {
    renderScreen(<TuningCard target={RE5} trace={[]} liveCents={6} a4={442} explanation={null} compact />);
    expect(screen.getByText('Ré5')).toBeInTheDocument();
    expect(screen.getByText('+6 ¢ · AFINADO')).toBeInTheDocument();
  });
});
