import React from 'react';
import styled from 'styled-components';
import { MAX_A4, MIN_A4 } from '../../game/notation/violin';

/** Referências comuns: barroco, padrão internacional, orquestras brasileiras (o padrão do jogo) e algumas europeias. */
export const A4_PRESETS = [
  { hz: 415, label: 'Barroco' },
  { hz: 440, label: 'Padrão' },
  { hz: 442, label: 'Orquestra' },
  { hz: 443, label: 'Europa' },
] as const;

const Box = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.375rem;
`;

const Stepper = styled.div`
  display: flex;
  align-items: center;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  overflow: hidden;

  button {
    width: 2.75rem;
    height: 2.75rem;
    background-color: ${({ theme }) => theme.colors.surface};
    font-weight: 600;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.text};
  }

  button:disabled {
    color: ${({ theme }) => theme.colors.textMuted};
    cursor: default;
  }

  output {
    min-width: 5rem;
    text-align: center;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Presets = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.25rem;

  button {
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0 0.5rem;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    font-size: 0.75rem;
    font-weight: 700;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  button[aria-pressed='true'] {
    border-color: ${({ theme }) => theme.colors.info.main};
    background-color: ${({ theme }) => theme.colors.info.surface};
    color: ${({ theme }) => theme.colors.info.text};
  }

  @media (max-height: 500px) {
    button {
      padding: 0 0.375rem;
    }
  }
`;

export interface A4PickerProps {
  a4: number;
  onChange: (hz: number) => void;
}

/** Lá de referência, de 415 a 466 Hz: −/+ de 1 em 1 e os atalhos mais usados. */
export const A4Picker: React.FC<A4PickerProps> = ({ a4, onChange }) => (
  <Box>
    <Stepper role="group" aria-label="Lá de referência">
      <button type="button" aria-label="Diminuir 1 Hz" disabled={a4 <= MIN_A4} onClick={() => onChange(a4 - 1)}>
        −
      </button>
      <output aria-live="polite">{a4} Hz</output>
      <button type="button" aria-label="Aumentar 1 Hz" disabled={a4 >= MAX_A4} onClick={() => onChange(a4 + 1)}>
        +
      </button>
    </Stepper>
    <Presets role="group" aria-label="Atalhos do Lá">
      {A4_PRESETS.map((p) => (
        <button key={p.hz} type="button" aria-pressed={a4 === p.hz} title={p.label} onClick={() => onChange(p.hz)}>
          {p.hz}
        </button>
      ))}
    </Presets>
  </Box>
);
