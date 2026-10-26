import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Button } from '../components/Button/Button';
import { Orchestra } from '../components/Orchestra/Orchestra';
import { stringName } from '../components/ResultSummary/summary';
import { formatPercent, formatPoints } from '../components/ScoreCard/ScoreCard';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { gameRoute, readResultState, type PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';

const Page = styled.main`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3rem;
  padding: ${({ theme }) => theme.spacing.lg};

  > svg {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 33%;
    pointer-events: none;
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.lg};
    padding: ${({ theme }) => theme.spacing.md};

    > svg {
      display: none;
    }
  }
`;

const Story = styled.div`
  position: relative;
  width: 32.5rem;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 3.25rem;
    line-height: 1.05;

    span {
      color: ${({ theme }) => theme.colors.primary.main};
    }
  }

  p {
    font-size: 1.0625rem;
    line-height: 1.625rem;
    color: ${({ theme }) => theme.colors.textMuted};

    b {
      color: ${({ theme }) => theme.colors.text};
    }
  }

  @media (max-height: 500px) {
    width: 24rem;
    gap: ${({ theme }) => theme.spacing.xs};

    h1 {
      font-size: 2rem;
    }

    p {
      font-size: 0.875rem;
      line-height: 1.25rem;
    }
  }
`;

const Stopped = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  > div {
    width: 22.5rem;
    overflow: hidden;
    border-radius: 0.75rem;
    background-color: ${({ theme }) => theme.colors.surface};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Stats = styled.dl`
  display: flex;
  gap: 1.75rem;

  div {
    min-width: 0;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.25rem;
  }

  dd {
    ${clampLines(1)}
    font-weight: 800;
    font-size: 1.75rem;
    line-height: 1;
  }

  @media (max-height: 500px) {
    dd {
      font-size: 1.25rem;
    }
  }
`;

const Next = styled.nav`
  position: relative;
  width: 23.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};

  > a {
    justify-content: space-between;
    min-height: 3rem;
  }

  small {
    font-size: 0.6875rem;
    letter-spacing: 0.1em;
  }

  @media (max-height: 500px) {
    width: 17rem;
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => theme.spacing.md};

    > a {
      min-height: 2.75rem;
    }

    small {
      display: none;
    }
  }
`;

/** Palco vazio ao fundo: cadeiras sem músico e a pauta. */
const EmptyStage: React.FC = () => {
  const theme = useTheme();
  const chairs = [90, 200, 310, 890, 1000, 1110];
  return (
    <svg viewBox="0 0 1280 240" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g stroke={theme.colors.surfaceBorder} strokeWidth="2" opacity="0.7">
        {[120, 140, 160, 180, 200].map((y) => (
          <line key={y} x1="0" x2="1280" y1={y} y2={y} />
        ))}
      </g>
      <g fill={theme.colors.surface} stroke={theme.colors.surfaceBorder} strokeWidth="3">
        {chairs.map((x) => (
          <path key={x} d={`M${x} 80 h80 v-40 a40 40 0 0 0 -80 0 z`} />
        ))}
      </g>
      <line x1="60" y1="82" x2="1220" y2="82" stroke={theme.colors.surfaceBorder} strokeWidth="3" />
    </svg>
  );
};

/** 6b · A orquestra parou: até onde chegou, o que mais errou e como tentar de novo. */
export const GameOver: React.FC = () => {
  const state = readResultState(useLocation().state);
  if (!state) return <Navigate to={ROUTES.home} replace />;
  const { song, result } = state;
  const again: PlayState & { next: string } = { song, mode: state.mode, latencyMs: state.latencyMs, next: gameRoute(state.mode) };
  const reached = Math.max(1, result.reachedMeasure + 1);

  return (
    <Page>
      <EmptyStage />
      <Story>
        <h1>
          A orquestra parou… <span>por hoje!</span>
        </h1>
        <p>
          Você chegou até o{' '}
          <b>
            compasso {reached} de {result.totalMeasures}
          </b>{' '}
          de {song.title}. Acontece: respire, afine e tente de novo com calma.
        </p>
        <Stopped>
          <Kicker>A orquestra parou de acompanhar</Kicker>
          <div>
            <Orchestra level={0} maestro />
          </div>
        </Stopped>
        <Stats>
          <div>
            <dd>{formatPoints(result.score)}</dd>
            <Kicker as="dt">Pontos</Kicker>
          </div>
          <div>
            <dd>{formatPercent(result.accuracy)}</dd>
            <Kicker as="dt">Precisão</Kicker>
          </div>
          <div>
            <dd>{stringName(result.mostMissedString) ?? '—'}</dd>
            <Kicker as="dt">Mais errado</Kicker>
          </div>
        </Stats>
      </Story>
      <Next aria-label="O que fazer agora">
        <Kicker>E agora?</Kicker>
        <Button as={Link} to={ROUTES.countdown} state={again} replace>
          <span>Tentar de novo</span>
          <span aria-hidden="true">▸</span>
        </Button>
        <Button as={Link} to={ROUTES.countdown} state={{ ...again, noFail: true }} replace $variant="ghost">
          <span>Tocar sem falha</span>
          <small>A MÚSICA NÃO PARA</small>
        </Button>
        <Button as={Link} to={ROUTES.calibration} state={{ song, mode: state.mode }} $variant="ghost">
          Afinar de novo
        </Button>
        <Button as={Link} to={ROUTES.home} $variant="ghost">
          Voltar ao início
        </Button>
      </Next>
    </Page>
  );
};
