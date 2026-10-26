import React from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { OfflineBanner } from '../components/OfflineBanner/OfflineBanner';
import { clampLines, Kicker, Screen } from '../components/Screen/Screen';
import { SongCover } from '../components/SongCover/SongCover';
import { levelSettings } from '../game/engine/levels';
import { loadLocalProfile } from '../services/profile';
import { usePlayableSong, useShelf } from '../services/shelf';
import { modesUrl, parseSongChoice, songsUrl, type SongChoice } from '../shell/choice';
import type { PlayState } from '../shell/play';
import { ROUTES } from '../shell/routes';

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Body = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4rem;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.lg};
  }
`;

const Cover = styled(SongCover)`
  flex: none;
  width: min(18.75rem, 30vw);
  aspect-ratio: 1;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;

  @media (max-height: 500px) {
    width: 9rem;
  }
`;

const Badge = styled.span`
  position: absolute;
  left: 0.75rem;
  top: 0.75rem;
  padding: 0.25rem 0.5625rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.info.main};
  color: ${({ theme }) => theme.colors.surface};
  font-weight: 700;
  font-size: 0.6875rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
`;

const Column = styled.div`
  width: min(30rem, 100%);
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Title = styled.h1`
  ${clampLines(2)}
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 2.125rem;
  line-height: 2.5rem;

  @media (max-height: 500px) {
    ${clampLines(1)}
    font-size: 1.5rem;
    line-height: 1.875rem;
  }
`;

const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 1.125rem;

  @media (max-height: 500px) {
    font-size: 0.9375rem;
  }
`;

const Bar = styled.span`
  flex: 1;
  height: 0.5rem;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    display: block;
    height: 100%;
    background-color: ${({ theme }) => theme.colors.info.main};
    transition: width 0.3s;
  }
`;

const Steps = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    font-size: 0.875rem;
  }
`;

const Step = styled.li<{ $state: 'done' | 'working' | 'waiting' }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: ${({ theme, $state }) => ($state === 'waiting' ? theme.colors.textMuted : theme.colors.text)};

  i {
    flex: none;
    width: 1.375rem;
    height: 1.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    font-style: normal;
    font-size: 0.75rem;
    font-weight: 800;
    ${({ theme, $state }) =>
      $state === 'done'
        ? `background-color: ${theme.colors.info.main}; color: ${theme.colors.surface};`
        : $state === 'working'
          ? `border: 2.5px solid ${theme.colors.surfaceBorder}; border-top-color: ${theme.colors.primary.main};`
          : `border: 1.5px dashed ${theme.colors.surfaceBorder};`}
  }

  @media (prefers-reduced-motion: no-preference) {
    i {
      animation: ${({ $state }) => ($state === 'working' ? spin : 'none')} 0.9s linear infinite;
    }
  }
`;

const Tip = styled.p`
  padding: 0.875rem 1rem;
  border-left: 3px solid ${({ theme }) => theme.game.strings.G.main};
  background-color: ${({ theme }) => theme.colors.surfaceHover};
  font-size: 0.875rem;
  line-height: 1.3125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  b {
    font-weight: 700;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Failure = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};

  p {
    color: ${({ theme }) => theme.colors.danger.text};
    font-weight: 700;
  }

  div {
    display: flex;
    flex-wrap: wrap;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Cancel = styled(Button)`
  align-self: flex-start;
`;

const Preparing: React.FC<{ choice: SongChoice }> = ({ choice }) => {
  const navigate = useNavigate();
  const shelf = useShelf();
  const playable = usePlayableSong(choice.songId, choice.level);
  const [settings] = React.useState(() => levelSettings(loadLocalProfile().level ?? 'beginner'));
  const sheet = shelf.status === 'ready' ? shelf.songs.find((s) => s.id === choice.songId) : undefined;
  const title = playable.status === 'ready' ? playable.song.title : (sheet?.title ?? (playable.status === 'error' ? 'Música indisponível' : '…'));
  const level = LEVEL_NAMES[choice.level];
  const back = songsUrl(choice.mode === 'Prática' ? 'Arcade' : choice.mode, choice.songId);

  const song = playable.status === 'ready' ? playable.song : null;
  React.useEffect(() => {
    if (song) navigate(ROUTES.calibration, { replace: true, state: { song, mode: choice.mode } satisfies PlayState });
  }, [song, choice.mode, navigate]);

  const ready = playable.status === 'ready';
  const steps = [
    { label: 'Ficha da música', state: sheet || ready ? 'done' : playable.status === 'loading' ? 'working' : 'waiting' },
    { label: `Partitura e notas do nível ${level}`, state: ready ? 'done' : playable.status === 'loading' ? 'working' : 'waiting' },
    { label: 'Dedilhado e cordas', state: ready ? 'done' : 'waiting' },
    { label: 'Afinar e conferir o microfone', state: 'waiting' },
  ] as const;
  const percent = Math.round((steps.filter((s) => s.state === 'done').length / steps.length) * 100);

  return (
    <Screen $gap="1rem">
      {shelf.status === 'ready' && shelf.fallback && <OfflineBanner reason={shelf.reason} count={shelf.songs.length} />}
      <Body>
        <Cover id={choice.songId}>{(sheet?.embedded || (playable.status === 'ready' && playable.embedded)) && <Badge>No app</Badge>}</Cover>
        <Column>
          <div>
            <Kicker>
              Preparando · {choice.mode} · {level}
            </Kicker>
            <Title>{title}</Title>
          </div>
          <Progress>
            <Bar role="progressbar" aria-label="Carregando" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <i style={{ width: `${percent}%` }} />
            </Bar>
            <span aria-hidden="true">{percent}%</span>
          </Progress>
          <Steps aria-label="Etapas">
            {steps.map((step) => (
              <Step key={step.label} $state={step.state}>
                <i aria-hidden="true">{step.state === 'done' ? '✓' : ''}</i>
                {step.label}
                <span className="sr-only">{step.state === 'done' ? ' (pronto)' : step.state === 'working' ? ' (carregando)' : ' (a seguir)'}</span>
              </Step>
            ))}
          </Steps>
          {playable.status === 'error' ? (
            <Failure role="alert">
              <p>{playable.error.message}</p>
              <div>
                <Button type="button" onClick={playable.retry}>
                  Tentar de novo
                </Button>
                <Button as={Link} to={back} $variant="ghost">
                  Escolher outra
                </Button>
              </div>
            </Failure>
          ) : (
            <>
              <Tip>
                <b>Dica:</b> afine antes de começar. Neste nível o jogo aceita até {settings.toleranceCents} ¢ de diferença, mas nota afinada
                soa melhor com a orquestra.
              </Tip>
              <Cancel as={Link} to={back} $variant="link">
                Cancelar
              </Cancel>
            </>
          )}
        </Column>
      </Body>
    </Screen>
  );
};

/** 4c · Carregando: baixa a partitura do nível (ou usa a do app) e segue para afinar. Sem internet, avisa. */
export const Loading: React.FC = () => {
  const [search] = useSearchParams();
  const choice = parseSongChoice(search);
  if (!choice) return <Navigate to={modesUrl()} replace />;
  return <Preparing key={`${choice.songId}:${choice.level}:${choice.mode}`} choice={choice} />;
};
