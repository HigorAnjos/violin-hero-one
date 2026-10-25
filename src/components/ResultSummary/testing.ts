import { simulateGame, type GameResult } from '../../game/engine';
import { ODE } from '../../game/engine/testing';

const cache = new Map<string, GameResult>();

/** Partida de verdade do motor (Ode, sem erros por padrão) para os testes das telas de resultado; simulada uma vez por combinação. */
export function playedResult(errors = 0, seed = 1, noFail = true): GameResult {
  const key = `${errors}:${seed}:${noFail}`;
  let result = cache.get(key);
  if (!result) {
    result = simulateGame({ song: ODE, startAt: 1, noFail }, { errors, seed }).result;
    cache.set(key, result);
  }
  return structuredClone(result);
}
