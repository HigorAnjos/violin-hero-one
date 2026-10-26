import React from 'react';
import styled from 'styled-components';

const Label = styled.label`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: 2.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.text};
  cursor: pointer;

  small {
    display: block;
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  /* A caixa do input tem 44 px (toque); o trilho de 40×22 do design é desenhado dentro dela */
  input {
    appearance: none;
    flex: none;
    position: relative;
    width: 2.75rem;
    height: 2.75rem;
    margin: 0 -0.125rem 0 0;
    background: none;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    cursor: pointer;
  }

  input::before {
    content: '';
    position: absolute;
    left: 0.125rem;
    top: 0.6875rem;
    width: 2.5rem;
    height: 1.375rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  input::after {
    content: '';
    position: absolute;
    top: calc(0.6875rem + 3px);
    left: calc(0.125rem + 3px);
    width: 1rem;
    height: 1rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.textMuted};
    transition: left 0.12s;
  }

  input:checked::before {
    background-color: ${({ theme }) => theme.colors.info.main};
  }

  input:checked::after {
    left: calc(0.125rem + 1.3125rem);
    background-color: ${({ theme }) => theme.colors.background};
  }

  input:focus-visible {
    outline: 2px solid ${({ theme }) => theme.colors.info.main};
    outline-offset: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    input::after {
      transition: none;
    }
  }

  @media (max-height: 500px) {
    font-size: 0.8125rem;

    small {
      display: none;
    }
  }
`;

export interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
}

/** Interruptor liga/desliga (.vh-tog do design): a linha inteira é a área de toque. */
export const Toggle: React.FC<ToggleProps> = ({ label, hint, checked, onChange, className }) => (
  <Label className={className}>
    <span>
      {label}
      {hint && <small>{hint}</small>}
    </span>
    <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </Label>
);
