import React from 'react';
import styled from 'styled-components';
import type { SongErrorKind } from '../../services/songs';

const Bar = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.25rem ${({ theme }) => theme.spacing.sm};
  min-height: 2.75rem;
  padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.md}`};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1.5px solid ${({ theme }) => theme.colors.warning.main};
  border-radius: 3px;
  font-size: 0.875rem;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};

  b {
    font-weight: 700;
    color: ${({ theme }) => theme.colors.warning.text};
  }

  @media (max-height: 500px) {
    min-height: 2rem;
    font-size: 0.75rem;
  }
`;

/**
 * Aviso de que a estante são só as músicas do app e as baixadas: sem internet, ou o servidor não respondeu.
 * `saved`: tem música baixada entre elas.
 */
export const OfflineBanner: React.FC<{ reason: SongErrorKind; count: number; saved?: boolean }> = ({ reason, count, saved = false }) => (
  <Bar role="status">
    <b>
      <span aria-hidden="true">▲ </span>
      {reason === 'offline' ? 'Sem internet' : 'Servidor fora do ar'}
    </b>
    <span>
      Você pode tocar as {count} músicas {saved ? 'do app e as baixadas' : 'que vêm no app'}. O resto volta quando a conexão voltar.
    </span>
  </Bar>
);
