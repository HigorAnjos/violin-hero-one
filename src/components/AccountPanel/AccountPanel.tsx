import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { AccountError, deleteAccount, signOut, unsentBeforeSignOut, type DeleteAccountClient } from '../../services/account';
import { loadLocalProfile } from '../../services/profile';
import type { SessionState } from '../../services/session';
import { supabase } from '../../services/supabase';
import { adoptUser } from '../../shell/accountSwitch';
import { accountUrl, ROUTES } from '../../shell/routes';
import { isStudentSession } from '../../shell/studentSession';
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

type Phase =
  | { step: 'idle' }
  | { step: 'busy' }
  | { step: 'confirm'; unsent: number }
  | { step: 'confirm-delete' }
  | { step: 'error'; message: string };

/** O que "Apagar" leva, dito antes de confirmar. Convidado não tem conta: apaga os dados. */
export function deleteWarning(anonymous: boolean): string {
  return anonymous
    ? 'Apaga do servidor e deste aparelho o seu progresso: partidas, recordes, selos, sequência, músicas importadas e desafios. Não dá para desfazer.'
    : 'Apaga a conta e tudo dela: perfil, partidas, recordes, selos, sequência, músicas importadas, desafios e vínculos de responsável. ' +
        'Se você é professor, as suas turmas, tarefas, entregas e as contas dos alunos delas saem junto. Não dá para desfazer.';
}

/** "Há 2 envios pendentes; sair agora os descarta." Partidas e gravações de tarefa somadas (DeviceData.pending). */
export function unsentWarning(unsent: number): string {
  return unsent === 1 ? 'Há 1 envio pendente; sair agora o descarta.' : `Há ${unsent} envios pendentes; sair agora os descarta.`;
}

/**
 * Configurações › Conta. Convidado: criar conta (o progresso vai junto) ou entrar numa que já existe. Com conta: o
 * apelido e o e-mail (só o próprio jogador vê) e "Sair da conta", que volta este aparelho a um convidado novo.
 * Sem rede, sair não descarta partidas em silêncio: pergunta antes, com Ficar como padrão.
 * "Apagar minha conta" (exigência das lojas) confirma antes, com Cancelar como padrão; conta de aluno da turma não
 * apaga sozinha (quem cadastrou foi o professor), e a tela diz com quem falar.
 */
export const AccountPanel: React.FC<{ client?: (DeleteAccountClient & Parameters<typeof adoptUser>[0]) | null; back: string }> = ({ client = supabase, back }) => {
  const session = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [phase, setPhase] = React.useState<Phase>({ step: 'idle' });
  const stay = React.useRef<HTMLButtonElement>(null);
  const keep = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (phase.step === 'confirm') stay.current?.focus();
    if (phase.step === 'confirm-delete') keep.current?.focus();
  }, [phase.step]);

  const erase = async (current: SessionState) => {
    setPhase({ step: 'busy' });
    try {
      const next = await deleteAccount(client, current);
      await adoptUser(client, next);
      queryClient.setQueryData(['session'], next);
      queryClient.removeQueries({ queryKey: ['progress'] });
      navigate(ROUTES.home);
    } catch (cause) {
      setPhase({ step: 'error', message: (cause instanceof AccountError ? cause : new AccountError('server', cause)).message });
    }
  };

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
      <SettingsRow>
        <Button as={Link} to={ROUTES.parent} $variant="link">Sou responsável</Button>
        <Button as={Link} to={ROUTES.teacher} $variant="link">Sou professor</Button>
      </SettingsRow>
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
      {session?.status === 'signed-in' && isStudentSession(session) && (
        <SettingsRow>
          <span>
            Apagar a conta
            <small>Esta conta é da turma: quem apaga é o professor. Peça na escola ou pelo responsável.</small>
          </span>
        </SettingsRow>
      )}
      {session?.status === 'signed-in' && !isStudentSession(session) && phase.step !== 'confirm-delete' && (
        <SettingsRow>
          <span>
            {session.anonymous ? 'Apagar meus dados' : 'Apagar minha conta'}
            <small>{session.anonymous ? 'Tira do servidor o progresso deste convidado' : 'A conta e tudo dela saem do servidor'}</small>
          </span>
          <Danger type="button" $variant="link" disabled={phase.step === 'busy'} onClick={() => setPhase({ step: 'confirm-delete' })}>
            Apagar
          </Danger>
        </SettingsRow>
      )}
      {session?.status === 'signed-in' && phase.step === 'confirm-delete' && (
        <Confirm role="alertdialog" aria-label={session.anonymous ? 'Apagar meus dados' : 'Apagar minha conta'} aria-describedby="vh-delete">
          <p id="vh-delete">{deleteWarning(session.anonymous)}</p>
          <SettingsControls>
            <Button ref={keep} type="button" onClick={() => setPhase({ step: 'idle' })}>
              Cancelar
            </Button>
            <Danger type="button" $variant="ghost" onClick={() => erase(session)}>
              Apagar para sempre
            </Danger>
          </SettingsControls>
        </Confirm>
      )}
      <SettingsRow>
        <span>
          Privacidade
          <small>O que o jogo guarda, para quê e como pedir exclusão</small>
        </span>
        <Button as={Link} to={ROUTES.privacy} $variant="link">
          Política de privacidade
        </Button>
      </SettingsRow>
      {phase.step === 'error' && <Alert role="alert">{phase.message}</Alert>}
    </SettingsPanel>
  );
};
