import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { Orchestra } from '../components/Orchestra/Orchestra';
import { PauseMenu } from '../components/PauseMenu/PauseMenu';
import { ScoreCard } from '../components/ScoreCard/ScoreCard';
import { SheetStrip, type SheetStripHandle } from '../components/SheetStrip/SheetStrip';
import { TuningCard } from '../components/TuningCard/TuningCard';
import { parseSimulate, type GameResult } from '../game/engine';
import { songDurationSeconds } from '../game/notation/song';
import { stageBox } from '../game/render/layout';
import { prefersReducedMotion } from '../game/render/present';
import { addEarnedBadges } from '../services/badges';
import { loadA4 } from '../services/playerAudio';
import { DEV_TOOLS } from '../shell/devTools';
import { micFailure, useEar } from '../shell/Ear';
import { readPlayState, type ResultState } from '../shell/play';
import { micTroubleUrl, ROUTES } from '../shell/routes';
import { COMPACT_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { useGame, type GameDeps } from '../shell/useGame';

const Page = styled.main`
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Backdrop = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  pointer-events: none;

  @media (max-height: 500px) {
    display: none;
  }
`;

const TrackHost = styled.div`
  position: absolute;
  overflow: hidden;

  canvas {
    display: block;
  }
`;

const PauseButton = styled.button`
  position: absolute;
  left: 50%;
  top: 1.5rem;
  width: 2.75rem;
  height: 2.75rem;
  margin-left: -1.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    left: auto;
    right: max(0.875rem, env(safe-area-inset-right));
    top: 0.75rem;
    margin-left: 0;
  }
`;

/** Quadros de tela da pista e do resto: a mesma conta do design (stageBox). */
const box = () => stageBox(window.innerWidth, window.innerHeight);

/** 5 · Gameplay (Arcade): pista, motor, orquestra e Ouvido no mesmo relógio. */
export const Gameplay: React.FC<{ deps?: Partial<GameDeps> }> = ({ deps }) => {
  const ear = useEar();
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const play = React.useMemo(() => readPlayState(location.state), [location.state]);
  const compact = useMediaQuery(COMPACT_QUERY);
  const [a4] = React.useState(loadA4);
  const [performance] = React.useState(() => (DEV_TOOLS ? parseSimulate(location.search) : null));
  const host = React.useRef<HTMLDivElement>(null);
  const sheet = React.useRef<SheetStripHandle>(null);
  const [stage, setStage] = React.useState(box);
  const total = React.useMemo(() => songDurationSeconds(play.song), [play.song]);
  const [trackOptions] = React.useState(() => ({ theme, reducedMotion: prefersReducedMotion() }));

  React.useEffect(() => {
    const onResize = () => setStage(box());
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const finish = React.useCallback(
    (result: GameResult) => {
      const state: ResultState = { song: play.song, mode: play.mode, latencyMs: play.latencyMs, noFail: play.noFail, result };
      if (result.status === 'failed') return navigate(ROUTES.gameOver, { replace: true, state });
      addEarnedBadges(result.badges);
      navigate(result.badges.length ? ROUTES.badge : ROUTES.results, { replace: true, state });
    },
    [navigate, play]
  );

  const micError = React.useCallback(
    (error: unknown) => {
      const { problem, cause } = micFailure(error);
      navigate(micTroubleUrl(problem, ROUTES.calibration, cause), { replace: true, state: play });
    },
    [navigate, play]
  );

  const game = useGame({
    ear,
    song: play.song,
    a4,
    noFail: play.noFail,
    performance,
    host,
    trackOptions,
    box,
    onBeat: (beat) => sheet.current?.setBeat(beat),
    onFinish: finish,
    onMicError: micError,
    deps,
  });
  const { phase, hud, pause, resume } = game;
  const paused = phase === 'paused' || phase === 'counting';

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (phase === 'playing') pause();
      else if (phase === 'paused') void resume();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [phase, pause, resume]);

  const target = hud.target ? { midi: hud.target.midi, string: hud.target.string, finger: hud.target.finger } : null;

  return (
    <Page aria-label={`${play.song.title} · ${play.mode}`}>
      <Backdrop>
        <Orchestra level={paused ? 4 : hud.level} maestro={paused} notes={!paused} decorative />
      </Backdrop>
      <TrackHost ref={host} style={{ left: stage.x, top: stage.y, width: stage.width, height: stage.height }} data-testid="pista" aria-hidden="true" />
      <ScoreCard score={hud.score} multiplier={hud.multiplier} combo={hud.combo} accuracy={hud.accuracy} level={hud.level} />
      <TuningCard target={target} trace={hud.trace} liveCents={hud.liveCents} a4={a4} explanation={hud.explanation} compact={compact} />
      {!paused && (
        <PauseButton type="button" aria-label="Pausar" onClick={pause} disabled={phase !== 'playing'}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        </PauseButton>
      )}
      <SheetStrip
        ref={sheet}
        song={play.song}
        measure={hud.measure}
        elapsed={Math.max(0, hud.elapsed)}
        total={total}
        past={hud.judged}
        next={target}
        paused={paused}
        compact={compact}
      />
      {paused && (
        <PauseMenu
          subtitle={`${play.song.title} · ${LEVEL_NAMES[play.song.level]}`}
          elapsed={Math.max(0, hud.elapsed)}
          total={total}
          volume={game.volume}
          onVolume={game.changeVolume}
          onContinue={() => void resume()}
          onRestart={() => navigate(ROUTES.countdown, { replace: true, state: { ...play, next: ROUTES.game } })}
          onRetune={() => navigate(ROUTES.calibration, { state: play })}
          onExit={() => navigate(ROUTES.home)}
          counting={game.counting}
          micClosed={game.micClosed}
        />
      )}
      {phase === 'broken' && <p role="alert">Não deu para começar o áudio. Volte e tente de novo.</p>}
    </Page>
  );
};
