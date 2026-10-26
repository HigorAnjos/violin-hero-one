import React from 'react';
import styled from 'styled-components';
import { Button } from '../Button/Button';

const Bar = styled.section`
  position: fixed;
  z-index: 10;
  left: 50%;
  bottom: max(${({ theme }) => theme.spacing.md}, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  width: max-content;
  max-width: calc(100% - 2rem);
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.xs} ${theme.spacing.xs} ${theme.spacing.md}`};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.info.main};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;

  p {
    display: flex;
    flex-direction: column;
  }

  b {
    font-weight: 800;
  }

  span {
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    bottom: max(${({ theme }) => theme.spacing.xs}, env(safe-area-inset-bottom));
    gap: ${({ theme }) => theme.spacing.xs};

    span {
      display: none;
    }
  }
`;

/** Aviso de versão nova do app: atualizar recarrega na hora; "Depois" deixa para a próxima abertura. */
export const UpdateNotice: React.FC<{ onUpdate: () => void; onLater: () => void }> = ({ onUpdate, onLater }) => (
  <Bar role="region" aria-label="Nova versão">
    <p role="status">
      <b>Nova versão do Violin Hero</b>
      <span>Leva um segundo e não apaga nada do seu progresso.</span>
    </p>
    <Button type="button" onClick={onUpdate}>
      Atualizar
    </Button>
    <Button type="button" $variant="ghost" onClick={onLater}>
      Depois
    </Button>
  </Bar>
);
