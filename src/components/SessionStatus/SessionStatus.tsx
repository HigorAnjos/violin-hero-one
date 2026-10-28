import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { useQuery } from '@tanstack/react-query';
import { ensureSession, type SessionState } from '../../services/session';
import { supabase } from '../../services/supabase';
import { accountUrl, ROUTES } from '../../shell/routes';

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

const AccountLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 2.75rem;
  padding: 0 ${({ theme }) => theme.spacing.md};
  background-color: ${({ theme }) => theme.colors.primary.main};
  border: 2px solid ${({ theme }) => theme.colors.primary.main};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  color: ${({ theme }) => theme.colors.primary.text};
  font-weight: 800;
  font-size: 0.9375rem;
  white-space: nowrap;
`;

/** Garante a sessão (anônima se preciso) e mostra o estado. Falha de rede vira "Offline", sem erro na tela. */
export const SessionStatus: React.FC<{ client?: Parameters<typeof ensureSession>[0]; accountLink?: boolean }> = ({
  client = supabase,
  accountLink = false,
}) => {
  const { data, isError } = useQuery({
    queryKey: ['session'],
    queryFn: () => ensureSession(client),
    staleTime: Infinity,
  });
  const state = isError ? { status: 'offline' as const } : data;
  const guest = state?.status === 'signed-in' && state.anonymous;
  return (
    <>
      <SessionBadge state={state} />
      {/* O convidado cria a conta (ou entra na que já tem) pela GuestPrompt, sem perder o que jogou */}
      {accountLink && guest && <AccountLink to={accountUrl('aparelho', ROUTES.home)}>Entrar ou criar conta</AccountLink>}
    </>
  );
};
