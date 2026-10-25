import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { MicSetupIllustration } from '../components/MicSetupIllustration/MicSetupIllustration';
import { OnboardSteps } from '../components/OnboardSteps/OnboardSteps';
import { Brand, Lead, Screen, ScreenHeader, ScreenTitle } from '../components/Screen/Screen';
import { markOnboarded } from '../services/profile';
import { micProblemFromError, useEar } from '../shell/Ear';
import { micTroubleUrl, ROUTES } from '../shell/routes';

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 3rem;

  > :first-child {
    flex: none;
    width: min(33.75rem, 45%);
  }

  @media (max-width: 900px), (max-height: 500px) {
    > :first-child {
      display: none;
    }
  }
`;

const Content = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Tips = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  font-size: 0.9375rem;
  line-height: 1.375rem;
  color: ${({ theme }) => theme.colors.text};

  li {
    display: flex;
    gap: 0.75rem;
  }

  li > span {
    color: ${({ theme }) => theme.colors.info.text};
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    font-size: 0.8125rem;
    line-height: 1.125rem;
  }
`;

const Box = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border-radius: 3px;
  font-size: 0.875rem;
  line-height: 1.25rem;

  @media (max-height: 500px) {
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.sm}`};
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Privacy = styled(Box)`
  background-color: ${({ theme }) => theme.colors.surfaceHover};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Blocked = styled(Box)`
  align-items: flex-start;
  gap: 0.75rem;
  border: 1px solid ${({ theme }) => theme.colors.danger.main};
  font-size: 0.8125rem;
  line-height: 1.1875rem;
  color: ${({ theme }) => theme.colors.text};

  > span:first-child {
    font-weight: 700;
    color: ${({ theme }) => theme.colors.danger.text};
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.xxs};

  > span {
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  b {
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Lock: React.FC = () => (
  <svg width="18" height="20" viewBox="0 0 18 20" aria-hidden="true">
    <rect x="2" y="9" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M5 9V6a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const LockIcon = styled.span`
  flex: none;
  display: flex;
  color: ${({ theme }) => theme.game.strings.A.main};
`;

/** 0b · Microfone: explica por que o jogo escuta e pede a permissão. */
export const OnboardMic: React.FC = () => {
  const ear = useEar();
  const navigate = useNavigate();
  const [asking, setAsking] = React.useState(false);

  const allow = async () => {
    setAsking(true);
    try {
      await ear.start();
      navigate(ROUTES.strings);
    } catch (error) {
      setAsking(false);
      navigate(micTroubleUrl(micProblemFromError(error), ROUTES.strings));
    }
  };

  return (
    <Screen $gap="1.5rem">
      <ScreenHeader>
        <Brand>
          Violin <span>Hero</span>
        </Brand>
        <OnboardSteps current={0} />
        <Button as={Link} to={ROUTES.home} $variant="link" onClick={markOnboarded}>
          Pular por agora
        </Button>
      </ScreenHeader>

      <Body>
        <MicSetupIllustration />
        <Content aria-labelledby="mic-titulo">
          <ScreenTitle id="mic-titulo">Precisamos ouvir seu violino</ScreenTitle>
          <Lead>O Violin Hero não usa controle: ele escuta o violino pelo microfone para saber qual nota você tocou, quando tocou e se está afinada.</Lead>
          <Tips>
            <li>
              <span aria-hidden="true">01</span>Fique de 30 a 60 cm do computador, com o violino virado para ele.
            </li>
            <li>
              <span aria-hidden="true">02</span>Prefira um lugar silencioso, sem música tocando ao fundo.
            </li>
            <li>
              <span aria-hidden="true">03</span>Fones de ouvido ajudam: o jogo não confunde a música com o seu violino.
            </li>
          </Tips>
          <Privacy>
            <LockIcon>
              <Lock />
            </LockIcon>
            O som é analisado no seu navegador e não é gravado.
          </Privacy>
          <Actions>
            <Button type="button" onClick={allow} disabled={asking}>
              Permitir microfone <span aria-hidden="true">▸</span>
            </Button>
            <span role="status">
              {asking ? (
                'Esperando a resposta do navegador…'
              ) : (
                <>
                  O navegador vai perguntar: clique em <b>Permitir</b>.
                </>
              )}
            </span>
          </Actions>
          <Blocked role="note">
            <span aria-hidden="true">!</span>
            <span>
              Bloqueou sem querer? Clique no cadeado ao lado do endereço do site, ative o <b>Microfone</b> e recarregue a página.
            </span>
          </Blocked>
        </Content>
      </Body>
    </Screen>
  );
};
