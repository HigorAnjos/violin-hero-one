import React from 'react';
import styled from 'styled-components';
import { pressPinKey, type PinKey } from '../SlotField/slots';

const Pad = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.625rem;

  /* Celular deitado: duas fileiras de seis, para o teclado caber ao lado do nome */
  @media (max-height: 500px) {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 0.375rem;
  }
`;

/** .vh-pic do design: tecla grande, de toque largo. */
const Key = styled.button`
  min-height: 3.75rem;
  min-width: 2.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.md};
  border: 2.5px solid ${({ theme }) => theme.colors.surfaceBorder};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 1.75rem;
  line-height: 1;

  &[data-action] {
    font-family: ${({ theme }) => theme.fonts.ui};
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (hover: hover) {
    &:hover:not(:disabled) {
      border-color: ${({ theme }) => theme.colors.text};
    }
  }

  &:active:not(:disabled) {
    background-color: ${({ theme }) => theme.colors.info.surface};
    border-color: ${({ theme }) => theme.colors.info.main};
  }

  @media (max-height: 500px) {
    min-height: 2.75rem;
    font-size: 1.25rem;

    &[data-action] {
      font-size: 0.75rem;
    }
  }
`;

const KEYS: readonly PinKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'apagar', '0', 'limpar'];
const ACTION_LABELS: Partial<Record<PinKey, string>> = { apagar: 'Apagar', limpar: 'Limpar' };

/** Teclado numérico do PIN: as teclas escrevem no campo (SlotField), que segue recebendo o teclado do aparelho. */
export const PinPad: React.FC<{ value: string; onChange(pin: string): void; disabled?: boolean; controls: string }> = ({ value, onChange, disabled, controls }) => (
  <Pad role="group" aria-label="Teclado do PIN">
    {KEYS.map((key) => (
      <Key
        key={key}
        type="button"
        data-action={ACTION_LABELS[key] ? '' : undefined}
        aria-controls={controls}
        // Tecla nenhuma desliga sozinha (o foco cairia fora do teclado): a quinta só não entra
        disabled={disabled}
        onClick={() => onChange(pressPinKey(value, key))}
      >
        {ACTION_LABELS[key] ?? key}
      </Key>
    ))}
  </Pad>
);
