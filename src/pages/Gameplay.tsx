import React from 'react';
import styled, { useTheme } from 'styled-components';
import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import { Orchestra } from '../components/Orchestra/Orchestra';
import { PauseMenu } from '../components/PauseMenu/PauseMenu';
import { ScoreCard } from '../components/ScoreCard/ScoreCard';
import { SheetStrip, type SheetStripHandle } from '../components/SheetStrip/SheetStrip';
import { StaffToggle } from '../components/StaffToggle/StaffToggle';
import { TuningCard } from '../components/TuningCard/TuningCard';
import { songDurationSeconds } from '../game/notation/song';
import { stageBox } from '../game/render/layout';
import { prefersReducedMotion } from '../game/render/present';
import { useEar } from '../shell/Ear';
import { gameRoute } from '../shell/play';
import type { PlayPrefs } from '../shell/playPrefs';
import { ROUTES } from '../shell/routes';
import { viewportSize } from '../shell/safeArea';
import { COMPACT_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { useGame, type GameDeps } from '../shell/useGame';
import { pauseSettings, useEscapePause, usePlayScreen } from '../shell/usePlayScreen';

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

/** Celular deitado: o botão Pauta à esquerda do Pausar, na mesma linha. */
const Staff = styled.div`
  position: absolute;
  right: calc(max(0.875rem, env(safe-area-inset-right)) + 3.25rem);
  top: 0.75rem;
`;

/** Quadros de tela da pista e do resto: a mesma conta do design (stageBox), com ou sem a pauta no celular deitado. */
const box = (prefs: Pick<PlayPrefs, 'landscapeStaff'>) => stageBox(window.innerWidth, window.innerHeight, prefs.landscapeStaff);

/** 5 · Gameplay (Arcade): pista, motor, orquestra e Ouvido no mesmo relógio. */
export const Gameplay: React.FC<{ deps?: Partial<GameDeps> }> = ({ deps }) => {
  const ear = useEar();
  const theme = useTheme();
  const { play, a4, performance, level, bands, finish, micError, navigate } = usePlayScreen('Arcade');
  const compact = useMediaQuery(COMPACT_QUERY);
  const host = React.useRef<HTMLDivElement>(null);
  const sheet = React.useRef<SheetStripHandle>(null);
  const [, setViewport] = React.useState(viewportSize);
  const total = React.useMemo(() => songDurationSeconds(play.song), [play.song]);
  const [trackOptions] = React.useState(() => ({ theme, reducedMotion: prefersReducedMotion() }));

  React.useEffect(() => {
    const onResize = () => setViewport(viewportSize());
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const game = useGame({
    ear,
    song: play.song,
    a4,
    noFail: play.noFail,
    record: play.recordAudio,
    performance,
    host,
    trackOptions,
    box,
    onBeat: (beat) => sheet.current?.setBeat(beat),
    onFinish: (result, recording) => finish(result, {}, recording),
    onMicError: micError,
    level,
    deps,
  });
  const { phase, hud, pause, resume } = game;
  const paused = phase === 'paused' || phase === 'counting';
  const stage = box(game.prefs);
  const staffToggle = compact && <StaffToggle pressed={game.prefs.landscapeStaff} onToggle={(on) => game.changePrefs({ landscapeStaff: on })} />;

  useEscapePause(phase, pause, resume);

  const target = hud.target ? { midi: hud.target.midi, string: hud.target.string, finger: hud.target.finger } : null;

  return (
    <Page aria-label={`${play.song.title} · ${play.mode}`}>
      <Backdrop>
        <Orchestra level={paused ? 4 : hud.level} maestro={paused} notes={!paused} decorative />
      </Backdrop>
      <TrackHost ref={host} style={{ left: stage.x, top: stage.y, width: stage.width, height: stage.height }} data-testid="pista" aria-hidden="true" />
      <ScoreCard score={hud.score} multiplier={hud.multiplier} combo={hud.combo} accuracy={hud.accuracy} level={hud.level} />
      <TuningCard target={target} trace={hud.trace} liveCents={hud.liveCents} a4={a4} explanation={hud.explanation} compact={compact} bands={bands} showLine={game.prefs.tuningLine} />
      {!paused && (
        <PauseButton type="button" aria-label="Pausar" onClick={pause} disabled={phase !== 'playing'}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        </PauseButton>
      )}
      {!paused && staffToggle && <Staff>{staffToggle}</Staff>}
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
        staff={game.prefs.landscapeStaff}
      />
      {paused && (
        <PauseMenu
          subtitle={`${play.song.title} · ${LEVEL_NAMES[play.song.level]}`}
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
          layoutToggle={staffToggle}
          {...pauseSettings(game)}
        />
      )}
      {phase === 'broken' && <p role="alert">Não deu para começar o áudio. Volte e tente de novo.</p>}
    </Page>
  );
};
