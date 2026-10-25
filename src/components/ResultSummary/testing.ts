import { simulateGame, type GameResult } from '../../game/engine';
import { ODE } from '../../game/engine/testing';

/** Partida de verdade do motor (Ode, sem erros por padrão) para os testes das telas de resultado. */
export function playedResult(errors = 0, seed = 1, noFail = true): GameResult {
  return simulateGame({ song: ODE, startAt: 1, noFail }, { errors, seed }).result;
}
