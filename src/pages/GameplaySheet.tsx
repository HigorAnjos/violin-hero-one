import React from 'react';
import styled, { useTheme } from 'styled-components';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { JudgmentCallout } from '../components/JudgmentCallout/JudgmentCallout';
import { LiveTuning } from '../components/LiveTuning/LiveTuning';
import { NowPlaying, type PlayingNote } from '../components/NowPlaying/NowPlaying';
import { Orchestra } from '../components/Orchestra/Orchestra';
import { PauseMenu } from '../components/PauseMenu/PauseMenu';
import { formatPercent, formatPoints } from '../components/ScoreCard/ScoreCard';
import { clampLines, Kicker } from '../components/Screen/Screen';
import { sheetCaption } from '../components/SheetPanel/sheetCaption';
import { SheetPanel } from '../components/SheetPanel/SheetPanel';
import type { EngineNote } from '../game/engine';
import { songDurationSeconds, type Song } from '../game/notation/song';
import { prefersReducedMotion } from '../game/render/present';
import { useEar } from '../shell/Ear';
import { gameRoute } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { useGame, type GameDeps } from '../shell/useGame';
import { pauseSettings, useEscapePause, usePlayScreen } from '../shell/usePlayScreen';

const Page = styled.main`
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem 2.5rem;
  background-color: ${({ theme }) => theme.colors.background};

  @media (max-width: 1100px) {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  @media (max-height: 500px) {
    gap: 0.5rem;
    padding: 0.5rem max(1rem, env(safe-area-inset-right)) 0.5rem max(1rem, env(safe-area-inset-left));
  }
`;

const Header = styled.header`
  flex: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 1.5rem;
  min-height: 3.5rem;

  > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  > div:first-child > span:last-child {
    ${clampLines(1)}
    font-weight: 600;
    font-size: 1rem;
  }

  @media (max-height: 500px) {
    gap: 0.75rem;
    min-height: 2.75rem;

    > div:first-child > ${Kicker} {
      display: none;
    }

    > div:first-child > span:last-child {
      font-size: 0.875rem;
    }
  }
`;

const PauseButton = styled.button`
  width: 2.75rem;
  height: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  color: ${({ theme }) => theme.colors.text};
`;

const Score = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 1rem;
  min-width: 0;

  > b {
    ${clampLines(1)}
    font-weight: 800;
    font-size: 2.25rem;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  > span {
    flex: none;
    font-weight: 800;
    font-size: 1.125rem;
    color: ${({ theme }) => theme.colors.primary.main};
  }

  > small {
    flex: none;
    font-size: 1rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: 0.5rem;

    > b {
      font-size: 1.375rem;
    }

    > span,
    > small {
      font-size: 0.8125rem;
    }
  }
`;

const Strip = styled(SheetPanel)``;

const SheetArea = styled.div`
  position: relative;
  flex: 1 1 19.875rem;
  min-height: 0;
  display: flex;
  flex-direction: column;

  > section {
    flex: 1 1 auto;
  }
`;

const Callout = styled(JudgmentCallout)`
  left: 26.5%;
  top: 2.5rem;

  @media (max-height: 500px) {
    top: 1.75rem;
  }
`;

const Bottom = styled.div`
  flex: 0 0 16.875rem;
  min-height: 0;
  display: grid;
  grid-template-columns: 27.5rem minmax(0, 1fr) 25rem;
  gap: 1.5rem;

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);

    > div {
      display: none;
    }
  }

  @media (max-height: 500px) {
    flex-basis: 6.5rem;
    gap: 0.5rem;
  }
`;

const Middle = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;

  > div {
    width: 15rem;
    overflow: hidden;
    border-radius: 0.75rem;
    background-color: ${({ theme }) => theme.colors.surface};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  }
`;

const Alert = styled.p`
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  padding: 1rem 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.danger.main};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
`;

/** A nota do motor como o painel "Nota atual" mostra: duração em tempos da música no andamento de agora. */
export function playingNote(note: EngineNote | null, song: Song, speed = 1): PlayingNote | null {
  if (!note) return null;
  return { midi: note.midi, string: note.string, finger: note.finger, beats: (note.duration * song.bpm * speed) / 60 };
}

/** 5b · Gameplay Partitura: a faixa de partitura corre da direita para a esquerda, com placar, nota da vez e afinação. */
export const GameplaySheet: React.FC<{ deps?: Partial<GameDeps> }> = ({ deps }) => {
  const ear = useEar();
  const theme = useTheme();
  const { play, a4, performance, level, bands, finish, micError, navigate } = usePlayScreen('Partitura');
  const host = React.useRef<HTMLDivElement>(null);
  const total = React.useMemo(() => songDurationSeconds(play.song), [play.song]);
  const [trackOptions] = React.useState(() => ({ theme, reducedMotion: prefersReducedMotion() }));
  const box = React.useCallback(() => ({ x: 0, y: 0, width: host.current?.clientWidth ?? 0, height: host.current?.clientHeight ?? 0 }), []);

  const game = useGame({
    ear,
    song: play.song,
    a4,
    noFail: play.noFail,
    performance,
    host,
    view: 'sheet',
    trackOptions,
    box,
    onFinish: finish,
    onMicError: micError,
    level,
    deps,
  });
  const { phase, hud, pause, resume } = game;
  const paused = phase === 'paused' || phase === 'counting';
  useEscapePause(phase, pause, resume);

  const subtitle = `${play.song.title} · ${LEVEL_NAMES[play.song.level]}`;
  const speed = hud.practice?.speed ?? 1;

  return (
    <Page aria-label={`${play.song.title} · ${play.mode}`}>
      <Header>
        <div>
          <Kicker>Modo Partitura</Kicker>
          <span>{subtitle}</span>
        </div>
        <PauseButton type="button" aria-label="Pausar" onClick={pause} disabled={phase !== 'playing'}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" />
          </svg>
        </PauseButton>
        <Score role="status" aria-label="Placar" aria-live="off">
          <b>{formatPoints(hud.score)}</b>
          <span>×{hud.multiplier}</span>
          <small>{formatPercent(hud.accuracy)}</small>
        </Score>
      </Header>

      <SheetArea>
        <Strip caption={sheetCaption(play.song, hud.measure)} elapsed={hud.elapsed} total={total} host={host}>
          <Callout callout={hud.callout} />
        </Strip>
      </SheetArea>

      <Bottom>
        <NowPlaying now={playingNote(hud.target, play.song, speed)} next={playingNote(hud.next, play.song, speed)} />
        <Middle>
          <Kicker>Orquestra tocando com você</Kicker>
          <div>
            <Orchestra level={paused ? 4 : hud.level} maestro={paused} notes={!paused} />
          </div>
        </Middle>
        <LiveTuning trace={hud.trace} liveCents={hud.liveCents} targetHz={hud.target?.frequency ?? null} bands={bands} showLine={game.prefs.tuningLine} />
      </Bottom>

      {paused && (
        <PauseMenu
          subtitle={subtitle}
          elapsed={Math.max(0, hud.elapsed)}
          total={total}
          volume={game.volume}
          onVolume={game.changeVolume}
          onContinue={() => void resume()}
          onRestart={() => navigate(ROUTES.countdown, { replace: true, state: { ...play, next: gameRoute(play.mode) } })}
          onRetune={() => navigate(ROUTES.calibration, { state: play })}
          onExit={() => navigate(ROUTES.home)}
          counting={game.counting}
          micClosed={game.micClosed}
          {...pauseSettings(game)}
        />
      )}
      {phase === 'broken' && <Alert role="alert">Não deu para começar o áudio. Volte e tente de novo.</Alert>}
    </Page>
  );
};
