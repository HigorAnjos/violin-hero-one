import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { OnboardSteps } from '../components/OnboardSteps/OnboardSteps';
import { advanceCheck, initialCheck, isComplete } from '../components/OpenStringCard/openStringCheck';
import { OpenStringCard, type OpenStringState } from '../components/OpenStringCard/OpenStringCard';
import { Brand, Kicker, Lead, Screen, ScreenHeader, ScreenTitle } from '../components/Screen/Screen';
import { SoundMeters } from '../components/SoundMeters/SoundMeters';
import { useSoundMeters } from '../components/SoundMeters/meterLevels';
import { STRING_SOLFEGE, type StringIndex } from '../game/notation/violin';
import { markOnboarded } from '../services/profile';
import { micFailure, useEar } from '../shell/Ear';
import { micTroubleUrl, ROUTES } from '../shell/routes';

const STRINGS: StringIndex[] = [0, 1, 2, 3];

const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  @media (max-height: 500px) {
    gap: 0;
  }
`;

const Cards = styled.ul`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1.25rem;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Panels = styled.div`
  display: flex;
  gap: 1.25rem;
  align-items: stretch;

  @media (max-width: 900px) and (min-height: 501px) {
    flex-direction: column;
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Help = styled.section`
  width: 26.25rem;
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 1rem 1.25rem;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-width: 900px) and (min-height: 501px) {
    width: auto;
  }

  @media (max-height: 500px) {
    width: 16rem;
    gap: 0;
    padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
    font-size: 0.75rem;
    line-height: 1rem;

    > span:nth-of-type(2) {
      display: none;
    }
  }
`;

const Footer = styled.footer`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: auto;

  > span {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  > div {
    display: flex;
    gap: 0.75rem;
  }
`;

function cardState(index: number, current: number): OpenStringState {
  if (index < current) return 'heard';
  return index === current ? 'listening' : 'next';
}

/** "2 de 4 cordas · falta Lá e Mi". */
export function progressText(current: number): string {
  if (current >= 4) return '4 de 4 cordas · tudo certo!';
  const missing = STRING_SOLFEGE.slice(current);
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} e ${missing[missing.length - 1]}` : missing[0];
  return `${current} de 4 cordas · falta ${list}`;
}

/** 0c · Cordas soltas: o jogador toca G, D, A e E; cada uma conta depois de 2 s soando. */
export const OnboardTest: React.FC = () => {
  const ear = useEar();
  const navigate = useNavigate();
  const [check, dispatch] = React.useReducer(advanceCheck, undefined, initialCheck);
  const meters = useSoundMeters(ear);
  const done = isComplete(check);

  React.useEffect(() => ear.onPitch(dispatch), [ear]);

  React.useEffect(() => {
    let alive = true;
    ear.start().catch((error) => {
      if (!alive) return;
      const { problem, cause } = micFailure(error);
      navigate(micTroubleUrl(problem, ROUTES.strings, cause), { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [ear, navigate]);

  const finish = () => {
    markOnboarded();
    navigate(ROUTES.countdown);
  };

  return (
    <Screen>
      <ScreenHeader>
        <Brand>
          Violin <span>Hero</span>
        </Brand>
        <OnboardSteps current={1} />
        <Button as={Link} to={ROUTES.home} $variant="link" onClick={markOnboarded}>
          Pular por agora
        </Button>
      </ScreenHeader>

      <Intro>
        <ScreenTitle>Toque cada corda solta com o arco</ScreenTitle>
        <Lead>Do grave para o agudo, uma de cada vez, sem apoiar nenhum dedo. Segure cada uma por 2 segundos.</Lead>
      </Intro>

      <Cards aria-label="Cordas soltas">
        {STRINGS.map((s) => {
          const state = cardState(s, check.current);
          return (
            <OpenStringCard
              key={s}
              string={s}
              state={state}
              cents={state === 'heard' ? check.results[s] : check.liveCents}
              heldSeconds={check.heldSeconds}
            />
          );
        })}
      </Cards>

      <Panels>
        <SoundMeters volumeDb={meters.volumeDb} noiseDb={meters.noiseDb} />
        <Help aria-labelledby="dica-titulo">
          <Kicker id="dica-titulo">Não estamos ouvindo?</Kicker>
          <span>Aproxime o violino do computador ou aumente a entrada do microfone nas configurações do sistema.</span>
          <Button as={Link} to={micTroubleUrl('no-sound', ROUTES.strings)} $variant="link">
            Abrir ajustes de microfone
          </Button>
        </Help>
      </Panels>

      <Footer>
        <span role="status">{progressText(check.current)}</span>
        <div>
          <Button as={Link} to={ROUTES.mic} $variant="ghost">
            <span aria-hidden="true">◂</span>Voltar
          </Button>
          <Button type="button" disabled={!done} onClick={finish}>
            Continuar <span aria-hidden="true">▸</span>
          </Button>
        </div>
      </Footer>
    </Screen>
  );
};
