import React from 'react';
import styled from 'styled-components';

/** As velocidades rápidas da prática e da pausa (fração do andamento da música). */
export const SPEEDS = [0.5, 0.7, 0.85, 1] as const;

/** 0,7 → "70%". */
export const speedLabel = (speed: number) => `${Math.round(speed * 100)}%`;

const Group = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;

  button {
    flex: 1 1 0;
    min-width: 2.75rem;
    min-height: 2.75rem;
    padding: 0 0.5rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    background: transparent;
    color: ${({ theme }) => theme.colors.textMuted};
    font-weight: 600;
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.info.main};
    border-color: ${({ theme }) => theme.colors.info.main};
    color: ${({ theme }) => theme.colors.background};
  }
`;

export interface SpeedPickerProps {
  speed: number;
  onSpeed: (speed: number) => void;
  label?: string;
  disabled?: boolean;
}

/** Botões 50% · 70% · 85% · 100%; o da velocidade atual fica marcado. */
export const SpeedPicker: React.FC<SpeedPickerProps> = ({ speed, onSpeed, label = 'Velocidade rápida', disabled }) => (
  <Group role="group" aria-label={label}>
    {SPEEDS.map((s) => (
      <button key={s} type="button" aria-pressed={Math.abs(s - speed) < 0.001} disabled={disabled} onClick={() => onSpeed(s)}>
        {speedLabel(s)}
      </button>
    ))}
  </Group>
);
