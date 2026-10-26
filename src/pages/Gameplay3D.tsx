import React from 'react';
import { useLocation } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { JudgmentCallout } from '../components/JudgmentCallout/JudgmentCallout';
import { Orchestra } from '../components/Orchestra/Orchestra';
import { PauseMenu } from '../components/PauseMenu/PauseMenu';
import { ScoreCard } from '../components/ScoreCard/ScoreCard';
import { SheetStrip, type SheetStripHandle } from '../components/SheetStrip/SheetStrip';
import { TuningCard } from '../components/TuningCard/TuningCard';
import { songDurationSeconds } from '../game/notation/song';
import { formatFps, parseFpsFlag, type FpsReport } from '../game/render/fps';
import { strings3dBox } from '../game/render/layout';
import { prefersReducedMotion } from '../game/render/present';
import { useEar } from '../shell/Ear';
import { gameRoute } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { COMPACT_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { useGame, type GameDeps } from '../shell/useGame';
import { pauseSettings, useEscapePause, usePlayScreen } from '../shell/usePlayScreen';

const Page = styled.main`
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  isolation: isolate;
  background-color: ${({ theme }) => theme.colors.background};
`;

/** A orquestra atrás do fundo do chão, entre os cartões (design: 760 de 1280, sem descer até as cordas). */
const Backdrop = styled.div`
  position: absolute;
  left: 50%;
  top: 0;
  width: min(47.5rem, 59%);
  transform: translateX(-50%);
  /* Atrás do chão das cordas (o canvas fica por cima dela, como a SVG do design) */
  z-index: -1;
  pointer-events: none;

  @media (max-height: 500px) {
    display: none;
  }
`;

const StringsHost = styled.div`
  position: absolute;
  overflow: hidden;

  canvas {
    display: block;
  }
`;

const PauseButton = styled.button`
  position: absolute;
  left: 50%;
  top: 1.25rem;
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

/** O julgamento à direita, na altura das cordas de cima (design: 56 px da borda, 236 px do topo). */
const Callout = styled(JudgmentCallout)`
  right: 3.5rem;
  top: 14.75rem;

  @media (max-width: 1100px) {
    right: 1rem;
  }

  @media (max-height: 500px) {
    right: max(0.875rem, env(safe-area-inset-right));
    top: auto;
    bottom: 8.25rem;
  }
`;

const Fps = styled.output`
  position: absolute;
  left: 50%;
  top: 4.5rem;
  transform: translateX(-50%);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** Quadros de tela das cordas: a conta do design (strings3dBox). */
const box = () => strings3dBox(window.innerWidth, window.innerHeight);

/** 5c · Gameplay Cordas 3D: as quatro cordas na frente e as notas vindo do fundo pela coluna da casa. */
export const Gameplay3D: React.FC<{ deps?: Partial<GameDeps> }> = ({ deps }) => {
  const ear = useEar();
  const theme = useTheme();
  const location = useLocation();
  const { play, a4, performance, level, bands, finish, micError, navigate } = usePlayScreen('Cordas 3D');
  const compact = useMediaQuery(COMPACT_QUERY);
  const host = React.useRef<HTMLDivElement>(null);
  const sheet = React.useRef<SheetStripHandle>(null);
  const [stage, setStage] = React.useState(box);
  const [fps, setFps] = React.useState<FpsReport | null>(null);
  const total = React.useMemo(() => songDurationSeconds(play.song), [play.song]);
  // ?fps=1 mostra o medidor (a meta é 60 fps no celular médio)
  const [trackOptions] = React.useState(() => ({
    theme,
    reducedMotion: prefersReducedMotion(),
    onFps: parseFpsFlag(location.search) ? (report: FpsReport) => setFps({ ...report }) : undefined,
  }));

  React.useEffect(() => {
    const onResize = () => setStage(box());
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const game = useGame({
    ear,
    song: play.song,
    a4,
    noFail: play.noFail,
    performance,
    host,
    view: '3d',
    trackOptions,
    box,
    onBeat: (beat) => sheet.current?.setBeat(beat),
    onFinish: finish,
    onMicError: micError,
    level,
    deps,
  });
  const { phase, hud, pause, resume } = game;
  const paused = phase === 'paused' || phase === 'counting';

  useEscapePause(phase, pause, resume);

  const target = hud.target ? { midi: hud.target.midi, string: hud.target.string, finger: hud.target.finger } : null;

  return (
    <Page aria-label={`${play.song.title} · ${play.mode}`}>
      <Backdrop>
        <Orchestra level={paused ? 4 : hud.level} maestro={paused} notes={!paused} decorative />
      </Backdrop>
      <StringsHost
        ref={host}
        style={{ left: stage.x, top: stage.y, width: stage.width, height: stage.height }}
        role="img"
        aria-label="Cordas 3D: as quatro cordas na frente e as notas chegando do fundo pelas colunas das casas"
        data-testid="cordas-3d"
      />
      <ScoreCard score={hud.score} multiplier={hud.multiplier} combo={hud.combo} accuracy={hud.accuracy} level={hud.level} sections={false} />
      <TuningCard target={target} trace={hud.trace} liveCents={hud.liveCents} a4={a4} explanation={hud.explanation} compact={compact} bands={bands} />
      <Callout callout={hud.callout} />
      {!paused && (
        <PauseButton type="button" aria-label="Pausar" onClick={pause} disabled={phase !== 'playing'}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
            <rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor" />
          </svg>
        </PauseButton>
      )}
      {fps && <Fps aria-label="Quadros por segundo">{formatFps(fps)}</Fps>}
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
          onRestart={() => navigate(ROUTES.countdown, { replace: true, state: { ...play, next: gameRoute(play.mode) } })}
          onRetune={() => navigate(ROUTES.calibration, { state: play })}
          onExit={() => navigate(ROUTES.home)}
          counting={game.counting}
          micClosed={game.micClosed}
          {...pauseSettings(game)}
        />
      )}
      {phase === 'broken' && <p role="alert">Não deu para começar o áudio. Volte e tente de novo.</p>}
    </Page>
  );
};
