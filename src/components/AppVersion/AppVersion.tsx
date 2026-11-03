import React from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { ROUTES } from '../../shell/routes';

/** Quantos toques na versão abrem o diagnóstico de áudio, e em quanto tempo. */
export const UNLOCK_TAPS = 5;
export const UNLOCK_WINDOW_MS = 3000;

const VersionButton = styled.button`
  align-self: flex-start;
  min-height: 2.75rem;
  margin-top: auto;
  padding: 0 0.875rem;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** A versão do app (Configurações); 5 toques seguidos abrem o diagnóstico de áudio, escondido. */
export const AppVersion: React.FC = () => {
  const navigate = useNavigate();
  const taps = React.useRef<number[]>([]);
  const tap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < UNLOCK_WINDOW_MS), now];
    if (taps.current.length >= UNLOCK_TAPS) {
      taps.current = [];
      navigate(ROUTES.diagnostics);
    }
  };
  return (
    <VersionButton type="button" onClick={tap}>
      Versão {__APP_VERSION__}
    </VersionButton>
  );
};
