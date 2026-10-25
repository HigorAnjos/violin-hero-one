import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import styled, { css, keyframes, useTheme } from 'styled-components';
import { Badge, badgeColor } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { badgeInfo, featuredBadges, nextCombo } from '../components/ResultSummary/summary';
import { Kicker } from '../components/Screen/Screen';
import { STRING_LETTERS } from '../game/notation/violin';
import { readResultState } from '../shell/play';
import { ROUTES } from '../shell/routes';

const spin = keyframes`to { transform: rotate(360deg); }`;
const pop = keyframes`
  0% { transform: scale(0.2) rotate(-25deg); opacity: 0; }
  60% { transform: scale(1.12) rotate(6deg); opacity: 1; }
  100% { transform: none; }
`;
const rise = keyframes`from { transform: translateY(18px); opacity: 0; }`;
const ring = keyframes`
  0% { transform: scale(0.6); opacity: 0.9; }
  100% { transform: scale(1.6); opacity: 0; }
`;
const fall = keyframes`
  0% { transform: translateY(-60px) rotate(0); opacity: 0; }
  10% { opacity: 1; }
  100% { transform: translateY(110vh) rotate(540deg); opacity: 1; }
`;
const fill = keyframes`from { width: 0; }`;

const motion = (rules: ReturnType<typeof css>) => css`
  @media (prefers-reduced-motion: no-preference) {
    ${rules}
  }
`;

const Page = styled.main`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => theme.spacing.sm};
  }
`;

const Confetti = styled.i<{ $x: number; $round: boolean; $delay: number; $duration: number }>`
  position: absolute;
  top: 0;
  left: ${({ $x }) => $x}%;
  width: ${({ $round }) => ($round ? '10px' : '8px')};
  height: ${({ $round }) => ($round ? '10px' : '16px')};
  border-radius: ${({ $round }) => ($round ? '999px' : '2px')};
  opacity: 0;
  pointer-events: none;
  ${({ $delay, $duration }) => motion(css`
    animation: ${fall} ${$duration}s linear ${$delay}s infinite;
  `)}

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`;

const Stage = styled.div`
  position: relative;
  width: 18rem;
  height: 18rem;
  display: flex;
  align-items: center;
  justify-content: center;

  > svg:first-child {
    position: absolute;
    inset: -5rem;
    width: calc(100% + 10rem);
    height: calc(100% + 10rem);
    ${motion(css`
      animation: ${spin} 24s linear infinite;
    `)}
  }

  @media (max-height: 500px) {
    width: 9rem;
    height: 9rem;

    > svg:first-child {
      inset: -2.5rem;
      width: calc(100% + 5rem);
      height: calc(100% + 5rem);
    }
  }
`;

const Ring = styled.span<{ $color: string }>`
  position: absolute;
  width: 11.25rem;
  height: 11.25rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 4px solid ${({ $color }) => $color};
  opacity: 0;
  ${motion(css`
    animation: ${ring} 1.4s ease-out 0.5s infinite;
  `)}
`;

const Pop = styled.div`
  position: relative;
  ${motion(css`
    animation: ${pop} 0.8s cubic-bezier(0.2, 1.4, 0.4, 1) 0.15s both;
  `)}

  svg {
    width: 11.875rem;
    height: auto;
  }

  @media (max-height: 500px) {
    svg {
      width: 6rem;
    }
  }
`;

const Rise = styled.div<{ $delay: number }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.625rem;
  ${({ $delay }) => motion(css`
    animation: ${rise} 0.5s ease-out ${$delay}s both;
  `)}

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 3.375rem;
    line-height: 1;
  }

  p {
    font-size: 1.125rem;
    line-height: 1.625rem;
    color: ${({ theme }) => theme.colors.textMuted};

    b {
      color: ${({ theme }) => theme.colors.text};
    }
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};

    h1 {
      font-size: 1.75rem;
    }

    p {
      font-size: 0.875rem;
      line-height: 1.25rem;
    }
  }
`;

const Next = styled.div`
  display: flex;
  align-items: center;
  gap: 0.875rem;
  margin-top: 0.375rem;
  padding: 0.625rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};

  > span {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.375rem;
    font-weight: 700;
    font-size: 0.8125rem;
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Bar = styled.span<{ $color: string }>`
  display: block;
  width: 16.25rem;
  height: 0.5rem;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: ${({ $color }) => $color};
    ${motion(css`
      animation: ${fill} 1.2s ease-out 1.1s both;
    `)}
  }
`;

const Actions = styled.div`
  margin-top: ${({ theme }) => theme.spacing.lg};

  @media (max-height: 500px) {
    margin-top: ${({ theme }) => theme.spacing.xs};
  }
`;

const CONFETTI = Array.from({ length: 26 }, (_, i) => {
  const seed = (i * 97 + 31) % 101;
  return { x: 2 + ((i * 211) % 1220) / 12.8, round: i % 3 === 0, duration: 3.2 + (seed % 20) / 10, delay: (seed % 30) / 10 };
});

/** 7a · Selo conquistado: aparece antes do resultado só quando a partida deu selo novo. */
export const BadgeEarned: React.FC = () => {
  const theme = useTheme();
  const state = readResultState(useLocation().state);
  if (!state || !state.result.badges.length) return <Navigate to={ROUTES.results} replace state={state} />;
  const { song, result } = state;
  const { featured, others: rest } = featuredBadges(result.badges);
  const badge = featured ?? badgeInfo(result.badges[0]);
  const others = rest.map((b) => b.label);
  const color = badgeColor(theme, badge.kind);
  const next = badge.kind === 'combo' ? nextCombo(result.maxCombo) : null;
  const palette = STRING_LETTERS.map((l) => theme.game.strings[l].main).concat(theme.colors.danger.main, theme.colors.text);

  return (
    <Page>
      <div aria-hidden="true">
        {CONFETTI.map((c, i) => (
          <Confetti key={i} $x={c.x} $round={c.round} $delay={c.delay} $duration={c.duration} style={{ background: palette[i % palette.length] }} />
        ))}
      </div>
      <Rise $delay={0.6}>
        <Kicker style={{ color }}>{song.title} · ganho nesta partida</Kicker>
      </Rise>
      <Stage>
        <svg viewBox="-300 -300 600 600" aria-hidden="true">
          <g fill={theme.colors.warning.surface}>
            {Array.from({ length: 12 }, (_, i) => (
              <path key={i} d="M0 0 L-26 -290 L26 -290 Z" transform={`rotate(${i * 30})`} />
            ))}
          </g>
          <circle r="120" fill={theme.colors.background} />
        </svg>
        <Ring $color={color} aria-hidden="true" />
        <Pop>
          <Badge kind={badge.kind} label={badge.label} size={190} />
        </Pop>
      </Stage>
      <Rise $delay={0.6}>
        <h1>
          Selo novo: <span style={{ color }}>{badge.label}</span>
        </h1>
      </Rise>
      <Rise $delay={0.8}>
        <p>
          {badge.description}
          {others.length > 0 && (
            <>
              {' '}
              E mais: <b>{others.join(', ')}</b>.
            </>
          )}
        </p>
      </Rise>
      {next && (
        <Rise $delay={1}>
          <Next>
            <Badge kind="combo" label={`Combo ${next.target}`} size={30} locked />
            <span>
              Próximo: Combo {next.target} · faltam {next.missing} notas
              <Bar $color={color} role="progressbar" aria-label={`Progresso até o Combo ${next.target}`} aria-valuenow={Math.round(next.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: `${next.progress * 100}%` }} />
              </Bar>
            </span>
          </Next>
        </Rise>
      )}
      <Rise $delay={1}>
        <Actions>
          <Button as={Link} to={ROUTES.results} state={state} replace>
            Ver resultado <span aria-hidden="true">▸</span>
          </Button>
        </Actions>
      </Rise>
    </Page>
  );
};
