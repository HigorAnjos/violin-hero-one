import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { ClassroomError, type ClassroomApi } from '../services/classroom';
import { accountUrl, ROUTES } from '../shell/routes';
import { useTeacherAccess, type TeacherAccess } from '../shell/useTeacher';

/** A moldura das telas do professor (P1–P3): a janela inteira, sem rolar a página; quem rola é o painel. */
export const TeacherPage = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  display: flex;
  gap: 1.375rem;
  padding: 1.5rem 2.25rem;
  overflow: hidden;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    gap: 0.75rem;
    padding: 0.625rem max(1rem, env(safe-area-inset-right)) 0.625rem max(1rem, env(safe-area-inset-left));
  }
`;

export const Column = styled.div`
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
`;

export const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;

  > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  h1 {
    ${clampLines(1)}
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.75rem;
    line-height: 2rem;
  }

  @media (max-height: 500px) {
    align-items: center;

    h1 {
      font-size: 1.25rem;
      line-height: 1.625rem;
    }
  }
`;

export const Actions = styled.div`
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;

  @media (max-height: 500px) {
    gap: 0.375rem;
  }
`;

/** .ns-panel do design. */
export const Panel = styled.section<{ $tone?: 'strong' | 'warning' }>`
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid
    ${({ theme, $tone }) => ($tone === 'strong' ? theme.colors.text : $tone === 'warning' ? theme.colors.warning.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};
  overflow-y: auto;

  @media (max-height: 500px) {
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
  }
`;

export const PanelHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
`;

export const Muted = styled.span`
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

export const Text = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;
`;

export const Alert = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.danger.text};
`;

/** Campo do design (.vh-in): 44 px de toque, borda clara, foco visível do tema. */
export const fieldStyles = `
  min-height: 2.75rem;
  width: 100%;
  min-width: 0;
  padding: 0 0.75rem;
  border-radius: 0.625rem;
  font: inherit;
  font-size: 0.9375rem;
`;

export const Input = styled.input`
  ${fieldStyles}
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
`;

export const Select = styled.select`
  ${fieldStyles}
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  text-overflow: ellipsis;
`;

/** Rótulo do campo em caixa alta, como o .vh-f do design. */
export const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;

  > span:first-child {
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

/** Botões de escolha (.vh-c do design), 44 px de toque. */
export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;

  button {
    min-height: 2.75rem;
    padding: 0 0.875rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
    background-color: ${({ theme }) => theme.colors.surface};
    color: ${({ theme }) => theme.colors.text};
    font-family: ${({ theme }) => theme.fonts.ui};
    font-weight: 700;
    font-size: 0.8125rem;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.text};
    color: ${({ theme }) => theme.colors.background};
  }
`;

const Center = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.75rem;
  max-width: 34rem;
  margin: 0 auto;
`;

/** O limite do plano: a mensagem e o caminho para os planos. */
export const LimitNotice: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Alert role="alert">
    {children ?? new ClassroomError('limit').message}{' '}
    <Button as={Link} to={ROUTES.plans} $variant="link">
      Ver planos <span aria-hidden="true">▸</span>
    </Button>
  </Alert>
);

const StateScreen: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <TeacherPage>
    <Center>
      <Kicker>Modo professor</Kicker>
      <Header as="div">
        <div>
          <h1>{title}</h1>
        </div>
      </Header>
      {children}
      <BackLink />
    </Center>
  </TeacherPage>
);

/**
 * Só conta com e-mail entra: anônimo vai para o pedido de conta (motivo professor) e volta para cá; conta de aluno
 * não vira professor. `api` (testes) troca a API da sessão.
 */
export const TeacherGate: React.FC<{ api?: ClassroomApi; children: (ready: Extract<TeacherAccess, { status: 'ready' }>) => React.ReactNode }> = ({ api, children }) => {
  const access = useTeacherAccess(api);
  const location = useLocation();
  if (access.status === 'needs-account') return <Navigate to={accountUrl('professor', location.pathname, ROUTES.home)} replace />;
  if (access.status === 'student')
    return (
      <StateScreen title="Esta é uma conta de aluno">
        <Text>Conta de aluno não cria turma. Para ser professor, saia desta conta em Configurações › Conta e entre com o seu e-mail.</Text>
        <Button as={Link} to={`${ROUTES.settings}?secao=conta`} $variant="ghost">
          Abrir configurações de conta
        </Button>
      </StateScreen>
    );
  if (access.status === 'offline')
    return (
      <StateScreen title="Sem conexão">
        <Text>{new ClassroomError('offline').message}</Text>
      </StateScreen>
    );
  if (access.status === 'loading')
    return (
      <TeacherPage>
        <Text role="status">Conectando…</Text>
      </TeacherPage>
    );
  return <>{children(access)}</>;
};
