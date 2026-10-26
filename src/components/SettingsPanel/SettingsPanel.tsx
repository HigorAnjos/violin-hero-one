import React from 'react';
import styled from 'styled-components';
import { Kicker } from '../Screen/Screen';

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0.5rem 1.25rem 0.75rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};

  > h2 {
    margin: 0.75rem 0 0.25rem;
  }

  @media (max-height: 500px) {
    padding: 0.25rem 0.875rem 0.5rem;

    > h2 {
      margin: 0.5rem 0 0.125rem;
    }
  }
`;

/** Painel de uma seção das Configurações (.ns-panel do design), com o rótulo em cima. `wide`: ocupa a linha toda. */
export const SettingsPanel: React.FC<{ title: string; children: React.ReactNode; wide?: boolean; className?: string }> = ({ title, children, wide, className }) => (
  <Panel aria-label={title} className={className} data-wide={wide ? '' : undefined}>
    <Kicker as="h2">{title}</Kicker>
    {children}
  </Panel>
);

/** Controles lado a lado na ponta direita de uma linha. */
export const SettingsControls = styled.span`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

/** Linha do painel (.vh-row): texto à esquerda, controle à direita, divisória embaixo. */
export const SettingsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 3.25rem;
  font-size: 0.9375rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.text};

  & + &,
  & + label,
  label + & {
    border-top: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  }

  small {
    display: block;
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    min-height: 2.75rem;
    font-size: 0.8125rem;
    gap: 0.5rem;

    small {
      display: none;
    }
  }
`;

/** Valor ao lado do controle (.vh-val): números alinhados, sem pular quando mudam. */
export const SettingsValue = styled.output`
  min-width: 4rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: ${({ theme }) => theme.colors.text};
`;

const RangeBox = styled.span`
  display: flex;
  align-items: center;
  gap: 0.625rem;

  input {
    width: 11.25rem;
    height: 2.75rem;
    margin: 0;
    accent-color: ${({ theme }) => theme.colors.primary.main};
  }

  @media (max-height: 500px) {
    input {
      width: 8rem;
    }

    output {
      min-width: 3rem;
    }
  }
`;

export interface SettingsRangeProps {
  label: string;
  hint?: string;
  /** 0 a 100. */
  value: number;
  step?: number;
  valueText: string;
  onChange: (value: number) => void;
}

/** Linha com controle deslizante (.vh-rng) e o valor escrito ao lado. */
export const SettingsRange: React.FC<SettingsRangeProps> = ({ label, hint, value, step = 5, valueText, onChange }) => {
  const id = React.useId();
  return (
    <SettingsRow>
      <label htmlFor={id}>
        {label}
        {hint && <small>{hint}</small>}
      </label>
      <RangeBox>
        <input id={id} type="range" min={0} max={100} step={step} value={value} aria-valuetext={valueText} onChange={(e) => onChange(Number(e.target.value))} />
        <SettingsValue htmlFor={id}>{valueText}</SettingsValue>
      </RangeBox>
    </SettingsRow>
  );
};
