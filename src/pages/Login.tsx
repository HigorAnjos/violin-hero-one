import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { EmailLinkForm } from '../components/EmailLinkForm/EmailLinkForm';
import { useSwitchConfirm } from '../components/SwitchConfirm/useSwitchConfirm';
import { ViolinArt } from '../components/ViolinArt/ViolinArt';
import { AccountError, authErrorFromUrl, loginWithGoogle, sendLoginLink } from '../services/account';
import { isOnboarded } from '../services/profile';
import { supabase } from '../services/supabase';
import { ROUTES } from '../shell/routes';
import { useAuthProviders, useSession } from '../shell/useAccount';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  display: flex;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Art = styled.div`
  position: relative;
  flex: 0 0 51.5%;
  overflow: hidden;

  @media (max-height: 500px) {
    flex-basis: 34%;
  }
`;

const Brand = styled.div`
  position: absolute;
  left: 3.5rem;
  top: 3rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 3.5rem;
    line-height: 0.95;
    color: ${({ theme }) => theme.colors.text};

    span {
      color: ${({ theme }) => theme.colors.info.text};
    }
  }

  p {
    font-weight: 700;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    left: 1rem;
    top: 0.75rem;

    h1 {
      font-size: 2rem;
    }

    p {
      font-size: 0.8125rem;
    }
  }
`;

const Perks = styled.ul`
  position: absolute;
  left: 3.5rem;
  bottom: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  list-style: none;
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};

  li {
    display: flex;
    gap: 0.625rem;
    align-items: center;
  }

  i {
    width: 0.5rem;
    height: 0.5rem;
    flex: none;
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Dot = styled.i<{ $string: 'G' | 'A' | 'E' }>`
  background-color: ${({ theme, $string }) => theme.game.strings[$string].main};
`;

const Start = styled.section`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 2.75rem 4rem;
  overflow-y: auto;
  background-color: ${({ theme }) => theme.colors.surface};
  border-left: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  h2 {
    margin-bottom: 0.25rem;
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2rem;
    line-height: 2.25rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    gap: 0.625rem;
    padding: 0.75rem max(1rem, env(safe-area-inset-right)) 0.75rem 1rem;

    h2 {
      font-size: 1.375rem;
      line-height: 1.75rem;
    }
  }
`;

const Play = styled(Link)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.125rem 1.25rem;
  border-radius: 16px;
  background-color: ${({ theme }) => theme.colors.text};
  color: ${({ theme }) => theme.colors.background};
  box-shadow: 0 5px 0 ${({ theme }) => theme.colors.info.main};
  text-decoration: none;

  > span:first-child {
    width: 3.25rem;
    height: 3.25rem;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 14px;
    background-color: ${({ theme }) => theme.colors.info.main};
    font-size: 1.625rem;
  }

  > span:nth-child(2) {
    flex: 1;
  }

  > span:last-child {
    font-weight: 800;
    font-size: 1.25rem;
  }

  b {
    display: block;
    font-weight: 800;
    font-size: 1.1875rem;
  }

  small {
    font-size: 0.875rem;
    opacity: 0.85;
  }

  @media (max-height: 500px) {
    padding: 0.625rem 1rem;

    > span:first-child {
      width: 2.75rem;
      height: 2.75rem;
    }
  }
`;

const Divider = styled.p`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.5rem;
  font-size: 0.8125rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.textMuted};

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }
`;

const Choices = styled.div`
  display: flex;
  gap: 0.625rem;

  > button {
    flex: 1;
  }
`;

const Note = styled.p`
  margin-top: auto;
  padding: 0.875rem 1rem;
  border: 1.5px dashed ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 14px;
  font-size: 0.8125rem;
  line-height: 1.1875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

const Alert = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.danger.text};
`;

/**
 * 0 · Boas-vindas: começar sem cadastro ou entrar numa conta que já existe (outro aparelho). Entrar troca o usuário
 * deste aparelho: o que o convidado tinha pendente sobe antes, na conta de convidado. O código da turma e o
 * "Sou professor" chegam no ciclo 5.
 */
export const Login: React.FC = () => {
  const session = useSession();
  const providers = useAuthProviders();
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(() => {
    const kind = authErrorFromUrl(window.location.href);
    return kind ? new AccountError(kind).message : null;
  });
  const switching = useSwitchConfirm();

  // Já numa conta: a raiz (ou o nível, se a primeira vez não acabou; a raiz voltaria para cá)
  if (session?.status === 'signed-in' && !session.anonymous) return <Navigate to={isOnboarded() ? ROUTES.home : ROUTES.level} replace />;

  const google = async () => {
    setError(null);
    if (!(await switching.ask())) return;
    try {
      await loginWithGoogle(supabase, session ?? { status: 'offline' }, ROUTES.home);
    } catch (cause) {
      setError(cause instanceof AccountError ? cause.message : new AccountError('server').message);
    }
  };

  return (
    <Page>
      <Art>
        <ViolinArt />
        <Brand>
          <h1>
            Violin <span>Hero</span>
          </h1>
          <p>Aprenda violino tocando de verdade.</p>
        </Brand>
        <Perks>
          <li>
            <Dot $string="G" />
            Toque sem cadastro: é só abrir e afinar
          </li>
          <li>
            <Dot $string="E" />
            Seu progresso fica salvo, e a conta leva para outro aparelho
          </li>
          <li>
            <Dot $string="A" />
            Funciona no celular, no tablet e no computador
          </li>
        </Perks>
      </Art>

      <Start aria-labelledby="comecar">
        <h2 id="comecar">Como você quer começar?</h2>
        <Play to={isOnboarded() ? ROUTES.home : ROUTES.level}>
          <span aria-hidden="true">🎻</span>
          <span>
            <b>Começar a tocar</b>
            <small>Sem cadastro. Seu progresso fica salvo neste aparelho.</small>
          </span>
          <span aria-hidden="true">▸</span>
        </Play>

        <Divider>Já tem conta?</Divider>
        <Choices>
          {providers.google && (
            <Button type="button" $variant="ghost" onClick={google}>
              Entrar com Google
            </Button>
          )}
          <Button type="button" $variant="ghost" aria-expanded={emailOpen} onClick={() => setEmailOpen((open) => !open)}>
            Entrar com e-mail
          </Button>
        </Choices>
        {emailOpen && (
          <EmailLinkForm
            autoFocus
            submitLabel="Mandar link"
            confirm={switching.ask}
            send={(email) => sendLoginLink(supabase, session ?? { status: 'offline' }, email, ROUTES.home)}
          />
        )}
        {switching.dialog}
        {error && <Alert role="alert">{error}</Alert>}

        <Note>A conta só é pedida quando faz falta: para entrar no ranking, desafiar amigos ou usar em outro aparelho. Tudo que você já tocou vai junto.</Note>
      </Start>
    </Page>
  );
};
