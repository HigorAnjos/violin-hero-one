import React from 'react';
import styled from 'styled-components';
import type { LoopRange } from '../../game/synth';
import { clampLoop } from '../LapChart/lapRules';

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;

  > span {
    flex: 1;
    font-size: 0.875rem;
  }

  output {
    min-width: 2.5rem;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  button {
    width: 2.75rem;
    height: 2.75rem;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    background: transparent;
    color: ${({ theme }) => theme.colors.text};
    font-size: 1.125rem;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  @media (max-height: 500px) {
    gap: 0.25rem;

    > span {
      font-size: 0.75rem;
    }
  }
`;

export interface LoopPickerProps {
  range: LoopRange;
  measures: number;
  onChange: (range: LoopRange) => void;
}

/** O trecho A–B por compasso (mostrado a partir de 1), com − e + de 44 px. */
export const LoopPicker: React.FC<LoopPickerProps> = ({ range, measures, onChange }) => {
  const move = (which: 'start' | 'end', delta: number) => {
    const next = which === 'start' ? { ...range, startMeasure: range.startMeasure + delta } : { ...range, endMeasure: range.endMeasure + delta };
    onChange(clampLoop(next, measures, which));
  };
  const row = (which: 'start' | 'end', name: string, value: number) => (
    <Row role="group" aria-label={`${name}: compasso ${value + 1}`}>
      <span>{name}</span>
      <button type="button" aria-label={`${name} um compasso antes`} disabled={value <= 0} onClick={() => move(which, -1)}>
        −
      </button>
      <output>{value + 1}</output>
      <button type="button" aria-label={`${name} um compasso depois`} disabled={value >= measures - 1} onClick={() => move(which, 1)}>
        +
      </button>
    </Row>
  );
  return (
    <>
      {row('start', 'Começo (A)', range.startMeasure)}
      {row('end', 'Fim (B)', range.endMeasure)}
    </>
  );
};
