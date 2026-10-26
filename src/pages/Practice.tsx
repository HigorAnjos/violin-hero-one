import React from 'react';
import styled, { useTheme } from 'styled-components';
import { Button } from '../components/Button/Button';
import { JudgmentCallout } from '../components/JudgmentCallout/JudgmentCallout';
import { LapChart } from '../components/LapChart/LapChart';
import { autoSpeed, lapAdvice, practiceTitle } from '../components/LapChart/lapRules';
import { LoopPicker } from '../components/LoopPicker/LoopPicker';
import { PauseMenu } from '../components/PauseMenu/PauseMenu';
import { clampLines, Kicker, ScreenTitle } from '../components/Screen/Screen';
import { sheetCaption } from '../components/SheetPanel/sheetCaption';
import { SheetPanel } from '../components/SheetPanel/SheetPanel';
import { SpeedPicker, speedLabel } from '../components/SpeedPicker/SpeedPicker';
import { Toggle } from '../components/Toggle/Toggle';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { songDurationSeconds } from '../game/notation/song';
import { prefersReducedMotion } from '../game/render/present';
import type { LoopRange } from '../game/synth';
import { useEar } from '../shell/Ear';
import type { PracticeStart } from '../shell/gameSession';
import { METRONOME_DEFAULT } from '../shell/metronome';
import { gameRoute } from '../shell/play';
import { ROUTES } from '../shell/routes';
import { useGame, type GameDeps } from '../shell/useGame';
import { pauseSettings, useEscapePause, usePlayScreen } from '../shell/usePlayScreen';

/** Sem trecho escolhido: do começo, sem laço, a 70% (contrato com a SongSelect). */
export const DEFAULT_PRACTICE: PracticeStart = { loop: null, speed: 0.7 };
/** Laço novo, sem trecho escolhido: dois compassos a partir de onde a música está. */
const NEW_LOOP_MEASURES = 2;

const Page = styled.main`
  position: relative;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding: 1.75rem 2.5rem;
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
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem;

  > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  > div:first-child > ${Kicker} {
    ${clampLines(1)}
  }

  h1 {
    ${clampLines(1)}
    font-size: 1.625rem;
    line-height: 2rem;
  }

  > div:last-child {
    flex: none;
    display: flex;
    gap: 0.75rem;
  }

  @media (max-height: 500px) {
    align-items: center;
    gap: 0.5rem;

    > div:first-child > ${Kicker} {
      display: none;
    }

    h1 {
      font-size: 1.125rem;
      line-height: 1.5rem;
    }

    > div:last-child {
      gap: 0.375rem;
    }

    > div:last-child > * {
      padding: 0 0.625rem;
      font-size: 0.75rem;
      letter-spacing: 0.02em;
    }
  }
`;

const SheetArea = styled.div`
  position: relative;
  flex: 0 1 18.75rem;
  min-height: 7rem;
  display: flex;
  flex-direction: column;

  > section {
    flex: 1 1 auto;
  }

  @media (max-height: 500px) {
    flex: 1 1 6rem;
    min-height: 5rem;
  }
`;

const Callout = styled(JudgmentCallout)`
  left: 26.5%;
  top: 2.5rem;

  @media (max-height: 500px) {
    top: 1.75rem;
  }
`;

const LapBadge = styled.p`
  position: absolute;
  right: 1rem;
  top: 2.5rem;
  padding: 0.375rem 0.75rem;
  border: 1.5px solid ${({ theme }) => theme.colors.primary.main};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.background};
  font-weight: 700;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  color: ${({ theme }) => theme.colors.primary.main};

  @media (max-height: 500px) {
    top: 1.75rem;
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
  }
`;

const Panels = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1.15fr;
  gap: 1.125rem;

  @media (max-height: 500px) {
    flex: none;
    gap: 0.5rem;
  }
`;

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  min-height: 0;
  padding: 1rem 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};
  overflow: hidden;

  > div:first-child {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.5rem;
  }

  > div:first-child > small {
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  > p {
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  @media (max-height: 500px) {
    gap: 0.125rem;
    padding: 0.375rem 0.625rem;

    > div:first-child > small {
      font-size: 0.75rem;
    }

    > p {
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
`;

const Big = styled.span`
  font-size: 2.75rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;

  @media (max-height: 500px) {
    display: none;
  }
`;

/** 10 · Prática: laço A–B por compassos, velocidade, metrônomo e as passadas. */
export const Practice: React.FC<{ deps?: Partial<GameDeps> }> = ({ deps }) => {
  const ear = useEar();
  const theme = useTheme();
  const { play, a4, performance, level, finish, micError, navigate } = usePlayScreen('Prática');
  const [start] = React.useState<PracticeStart>(() => play.practice ?? DEFAULT_PRACTICE);
  const [loopRange, setLoopRange] = React.useState<LoopRange>(
    () => start.loop ?? { startMeasure: start.from ?? 0, endMeasure: Math.min(play.song.measures.length - 1, (start.from ?? 0) + NEW_LOOP_MEASURES - 1) }
  );
  const [auto, setAuto] = React.useState(false);
  const host = React.useRef<HTMLDivElement>(null);
  const total = React.useMemo(() => songDurationSeconds(play.song), [play.song]);
  const [trackOptions] = React.useState(() => ({ theme, reducedMotion: prefersReducedMotion() }));
  const box = React.useCallback(() => ({ x: 0, y: 0, width: host.current?.clientWidth ?? 0, height: host.current?.clientHeight ?? 0 }), []);

  const game = useGame({
    ear,
    song: play.song,
    a4,
    performance,
    host,
    view: 'sheet',
    trackOptions,
    box,
    practice: start,
    onFinish: (result) => finish(result, { practice: { loop: game.hud.practice?.loop ?? null, speed: game.hud.practice?.speed ?? start.speed, from: start.from } }),
    onMicError: micError,
    level,
    deps,
  });
  const { phase, hud, pause, resume } = game;
  const paused = phase === 'paused' || phase === 'counting';
  useEscapePause(phase, pause, resume);

  const info = hud.practice;
  const speed = info?.speed ?? start.speed;
  const loop = info ? info.loop : start.loop;

  // Acelerar sozinho: cada passada que fecha pode subir 5%
  const laps = info?.laps;
  React.useEffect(() => {
    if (!auto || !laps) return;
    const next = autoSpeed(laps, speed);    if (next !== null) game.practice.setSpeed(next);
  }, [auto, laps, speed, game.practice]);

  const changeLoop = (range: LoopRange) => {
    setLoopRange(range);
    if (loop) game.practice.setLoop(range);
  };
  const toggleLoop = (on: boolean) => game.practice.setLoop(on ? loopRange : null);
  const subtitle = `${play.song.title} · ${LEVEL_NAMES[play.song.level]}`;
  const caption = loop ? sheetCaption(play.song, hud.measure, `Laço ${loop.startMeasure + 1}–${loop.endMeasure + 1}`) : sheetCaption(play.song, hud.measure);

  return (
    <Page aria-label={`${play.song.title} · Prática`}>
      <Header>
        <div>
          <Kicker>Modo prática · {play.song.title}</Kicker>
          <ScreenTitle>{practiceTitle(loop, start.from ?? loop?.startMeasure ?? 0)}</ScreenTitle>
        </div>
        <div>
          <Button type="button" $variant="ghost" onClick={() => game.practice.stop()} disabled={phase !== 'playing' && phase !== 'paused'}>
            <span aria-hidden="true">◂</span>Sair da prática
          </Button>
          <Button type="button" $variant="ghost" onClick={() => navigate(ROUTES.countdown, { replace: true, state: { song: play.song, mode: 'Arcade', next: gameRoute('Arcade') } })}>
            Tocar a música inteira
          </Button>
          <Button type="button" $variant="ghost" onClick={pause} disabled={phase !== 'playing'} aria-label="Pausar">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3" y="2" width="3.5" height="12" fill="currentColor" />
              <rect x="9.5" y="2" width="3.5" height="12" fill="currentColor" />
            </svg>
          </Button>
        </div>
      </Header>

      <SheetArea>
        <SheetPanel caption={caption} elapsed={hud.elapsed} total={total} host={host} accent={loop ? theme.colors.primary.main : undefined} label="Partitura da prática">
          <Callout callout={hud.callout} />
          {info && <LapBadge aria-live="polite">PASSADA {info.lap + 1}</LapBadge>}
        </SheetPanel>
      </SheetArea>

      <Panels>
        <Panel aria-label="Velocidade">
          <div>
            <Kicker>Velocidade</Kicker>
            <small>
              {Math.round(play.song.bpm * speed)} de {play.song.bpm} BPM
            </small>
          </div>
          <Big>{speedLabel(speed)}</Big>
          <SpeedPicker speed={speed} onSpeed={(s) => game.practice.setSpeed(s)} />
          <Toggle label="Acelerar sozinho" hint="+5% a cada 2 passadas acima de 90%" checked={auto} onChange={setAuto} />
          <Toggle label="Metrônomo" checked={game.metronome > 0} onChange={(on) => game.changeMetronome(on ? METRONOME_DEFAULT : 0)} />
        </Panel>

        <Panel aria-label="Trecho">
          <div>
            <Kicker>Trecho</Kicker>
            <small>{play.song.measures.length} compassos</small>
          </div>
          <Toggle label="Repetir o trecho" hint="Volta ao A no fim do B" checked={loop !== null} onChange={toggleLoop} />
          <LoopPicker range={loopRange} measures={play.song.measures.length} onChange={changeLoop} />
        </Panel>

        <Panel aria-label="Passadas">
          <div>
            <Kicker>Passadas</Kicker>
            <small>{info ? `passada ${info.lap + 1} tocando agora` : 'começando'}</small>
          </div>
          <LapChart laps={info?.laps ?? []} best={info?.bestLap ?? null} playing={phase === 'playing'} />
          <p>{lapAdvice(info?.laps ?? [], speed, auto)}</p>
        </Panel>
      </Panels>

      {paused && (
        <PauseMenu
          subtitle={subtitle}
          elapsed={Math.max(0, hud.elapsed)}
          total={total}
          volume={game.volume}
          onVolume={game.changeVolume}
          onContinue={() => void resume()}
          onRestart={() => navigate(ROUTES.countdown, { replace: true, state: { ...play, practice: start, next: gameRoute('Prática') } })}
          onRetune={() => navigate(ROUTES.calibration, { state: { ...play, practice: start } })}
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
