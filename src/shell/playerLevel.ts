import { levelSettings, type LevelSettings, type PlayerLevel } from '../game/engine';
import { loadLocalProfile } from '../services/profile';

/** Sem nível escolhido (perfil apagado, e2e direto no /jogo), as folgas do motor de sempre. */
export const FALLBACK_LEVEL: PlayerLevel = 'some_songs';

/** O nível guardado no aparelho e o que ele dá à partida. */
export function playerLevelSettings(): LevelSettings {
  return levelSettings(loadLocalProfile().level ?? FALLBACK_LEVEL);
}
