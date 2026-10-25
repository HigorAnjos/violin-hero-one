import React from 'react';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { ensureSession, type SessionState } from '../../services/session';
import { supabase } from '../../services/supabase';

type Tone = 'on' | 'off';

/** Texto da sessão; sem estado ainda (primeira consulta), "Conectando…". */
export function sessionLabel(state: SessionState | undefined): { text: string; tone: Tone } {
  if (!state) return { text: 'Conectando…', tone: 'off' };
  if (state.status === 'offline') return { text: 'Offline', tone: 'off' };
  return { text: state.anonymous ? 'Jogando como convidado' : 'Conta ligada', tone: 'on' };
}

const Pill = styled.p`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  min-height: 2.75rem;
  padding: 0 ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  color: ${({ theme }) => theme.colors.text};
  font-weight: 800;
  font-size: 0.9375rem;
  white-space: nowrap;
`;

const Dot = styled.span<{ $tone: Tone }>`
  flex: none;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme, $tone }) => ($tone === 'on' ? theme.colors.success.main : theme.colors.textMuted)};
`;

/** Pílula com o estado da sessão. O texto carrega o sentido; o ponto só reforça. */
export const SessionBadge: React.FC<{ state: SessionState | undefined }> = ({ state }) => {
  const { text, tone } = sessionLabel(state);
  return (
    <Pill role="status">
      <Dot $tone={tone} aria-hidden="true" />
      {text}
    </Pill>
  );
};

/** Garante a sessão (anônima se preciso) e mostra o estado. Falha de rede vira "Offline", sem erro na tela. */
export const SessionStatus: React.FC<{ client?: Parameters<typeof ensureSession>[0] }> = ({ client = supabase }) => {
  const { data, isError } = useQuery({
    queryKey: ['session'],
    queryFn: () => ensureSession(client),
    staleTime: Infinity,
  });
  return <SessionBadge state={isError ? { status: 'offline' } : data} />;
};
