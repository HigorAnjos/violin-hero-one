import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { AccountError, signOut, unsentBeforeSignOut, type AccountClient } from '../../services/account';
import { loadLocalProfile } from '../../services/profile';
import type { SessionState } from '../../services/session';
import { supabase } from '../../services/supabase';
import { adoptUser } from '../../shell/accountSwitch';
import { accountUrl, ROUTES } from '../../shell/routes';
import { useSession } from '../../shell/useAccount';
import { Button } from '../Button/Button';
import { SettingsControls, SettingsPanel, SettingsRow } from '../SettingsPanel/SettingsPanel';

const Danger = styled(Button)`
  color: ${({ theme }) => theme.colors.danger.text};
`;

const Confirm = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.875rem 0 0.25rem;
  border-top: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};
`;

const Alert = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.danger.text};
`;

type Phase = { step: 'idle' } | { step: 'busy' } | { step: 'confirm'; unsent: number } | { step: 'error'; message: string };

/** "Há 2 partidas ainda não enviadas; sair agora as descarta." */
export function unsentWarning(unsent: number): string {
  return unsent === 1
    ? 'Há 1 partida ainda não enviada; sair agora a descarta.'
    : `Há ${unsent} partidas ainda não enviadas; sair agora as descarta.`;
}

/**
 * Configurações › Conta. Convidado: criar conta (o progresso vai junto) ou entrar numa que já existe. Com conta: o
 * apelido e o e-mail (só o próprio jogador vê) e "Sair da conta", que volta este aparelho a um convidado novo.
 * Sem rede, sair não descarta partidas em silêncio: pergunta antes, com Ficar como padrão.
 */
export const AccountPanel: React.FC<{ client?: (AccountClient & Parameters<typeof adoptUser>[0]) | null; back: string }> = ({ client = supabase, back }) => {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>({ step: 'idle' });
  const stay = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (phase.step === 'confirm') stay.current?.focus();
  }, [phase.step]);

  const leave = async (current: SessionState) => {
    setPhase({ step: 'busy' });
    try {
      const next = await signOut(client, current);
      await adoptUser(client, next);
      queryClient.setQueryData(['session'], next);
      queryClient.removeQueries({ queryKey: ['progress'] });
      navigate(ROUTES.home);
    } catch (cause) {
      setPhase({ step: 'error', message: (cause instanceof AccountError ? cause : new AccountError('server', cause)).message });
    }
  };

  const askToLeave = async (current: SessionState) => {
    setPhase({ step: 'busy' });
    const unsent = await unsentBeforeSignOut(current);
    if (unsent > 0) setPhase({ step: 'confirm', unsent });
    else await leave(current);
  };

  return (
    <SettingsPanel title="Conta" wide>
      {!session && <SettingsRow>Conectando…</SettingsRow>}
      {session?.status === 'offline' && <SettingsRow>{new AccountError('offline').message}</SettingsRow>}
      {session?.status === 'signed-in' && session.anonymous && (
        <>
          <SettingsRow>
            <span>
              Jogando como convidado
              <small>Seu progresso fica salvo neste aparelho. A conta leva ele para outro aparelho.</small>
            </span>
            <Button as={Link} to={accountUrl('aparelho', back)} $variant="link">
              Criar conta
            </Button>
          </SettingsRow>
          <SettingsRow>
            <span>
              Já tem conta?
              <small>Entrar troca este aparelho para a sua conta</small>
            </span>
            <Button as={Link} to={ROUTES.login} $variant="link">
              Entrar
            </Button>
          </SettingsRow>
        </>
      )}
      {session?.status === 'signed-in' && !session.anonymous && (
        <SettingsRow>
          <span>
            {/* "Conectada como" do design, sem gênero (o jogo não sabe nem pergunta) */}
            Conta ligada:
            <b> {[loadLocalProfile().nickname ?? 'você', session.email].filter(Boolean).join(' · ')}</b>
            <small>O e-mail é só para entrar: ninguém mais vê</small>
          </span>
          <SettingsControls>
            {phase.step !== 'confirm' && (
              <Danger type="button" $variant="link" disabled={phase.step === 'busy'} onClick={() => askToLeave(session)}>
                Sair da conta
              </Danger>
            )}
          </SettingsControls>
        </SettingsRow>
      )}
      {session?.status === 'signed-in' && phase.step === 'confirm' && (
        <Confirm role="alertdialog" aria-label="Sair da conta" aria-describedby="vh-unsent">
          <p id="vh-unsent">{unsentWarning(phase.unsent)}</p>
          <SettingsControls>
            <Button ref={stay} type="button" onClick={() => setPhase({ step: 'idle' })}>
              Ficar
            </Button>
            <Button type="button" $variant="ghost" onClick={() => leave(session)}>
              Sair mesmo assim
            </Button>
          </SettingsControls>
        </Confirm>
      )}
      {phase.step === 'error' && <Alert role="alert">{phase.message}</Alert>}
    </SettingsPanel>
  );
};
