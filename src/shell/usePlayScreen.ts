import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { tuningBands } from '../components/Tuner/tuner';
import type { GameResult } from '../game/engine';
import { parseSimulate } from '../game/engine/simulate';
import { findFixedSong } from '../game/notation/songs';
import { addEarnedBadges } from '../services/badges';
import { loadA4 } from '../services/playerAudio';
import { DEV_TOOLS } from './devTools';
import { micFailure } from './Ear';
import { readPlayState, type GameMode, type ResultState } from './play';
import { playerLevelSettings } from './playerLevel';
import { micTroubleUrl, ROUTES } from './routes';
import type { GamePhase, useGame } from './useGame';

/**
 * O que as telas de partida (Arcade, Partitura, Prática) têm em comum: o estado da navegação, o Lá, o nível, o
 * ?simular, para onde ir no fim e no erro do microfone, e o ESC da pausa.
 */
export function usePlayScreen(mode: GameMode) {
  const navigate = useNavigate();
  const location = useLocation();
  const play = React.useMemo(() => {
    // O modo é o da tela: quem chega direto no endereço (e2e, recarregar) volta para a mesma tela no "de novo"
    const state = { ...readPlayState(location.state), mode };
    // ?musica=<id> abre a música direto na tela, para o e2e que toca um WAV no lugar do microfone
    const chosen = DEV_TOOLS ? findFixedSong(new URLSearchParams(location.search).get('musica') ?? '') : undefined;
    return chosen ? { ...state, song: chosen.song } : state;
  }, [location.state, location.search, mode]);
  const [a4] = React.useState(loadA4);
  const [performance] = React.useState(() => (DEV_TOOLS ? parseSimulate(location.search) : null));
  const [level] = React.useState(playerLevelSettings);
  const bands = React.useMemo(() => tuningBands(level.toleranceCents), [level]);

  const finish = React.useCallback(
    (result: GameResult, extra: Partial<ResultState> = {}) => {
      const state: ResultState = { song: play.song, mode: play.mode, latencyMs: play.latencyMs, noFail: play.noFail, ...extra, result };
      if (DEV_TOOLS) (window as Window & { __vhResult?: GameResult }).__vhResult = result;
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

  return { play, a4, performance, level, bands, finish, micError, navigate };
}

type Game = Pick<ReturnType<typeof useGame>, 'hud' | 'practiced' | 'practice' | 'toPractice' | 'metronome' | 'changeMetronome'>;

/**
 * Velocidade e metrônomo da pausa. Na partida comum, mudar a velocidade avisa e, confirmado, a partida vira prática no
 * próximo compasso; já em prática, muda direto (vale no próximo compasso).
 */
export function pauseSettings(game: Game) {
  const inPractice = game.hud.practice !== null || game.practiced;
  return {
    speed: game.hud.practice?.speed ?? 1,
    speedNeedsConfirm: !inPractice,
    onSpeed: (speed: number) => (inPractice ? game.practice.setSpeed(speed) : void game.toPractice(speed)),
    metronome: game.metronome,
    onMetronome: game.changeMetronome,
  };
}

/** ESC pausa e, na pausa, continua. */
export function useEscapePause(phase: GamePhase, pause: () => void, resume: () => Promise<void> | void, enabled = true): void {
  React.useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (phase === 'playing') pause();
      else if (phase === 'paused') void resume();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [phase, pause, resume, enabled]);
}
