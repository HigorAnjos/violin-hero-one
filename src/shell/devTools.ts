import type { Recording, RecordingError } from '../game/audio';
import type { GameResult } from '../game/engine';

/**
 * Ferramentas de conferência (?ouvido=simulado, ?simular): no servidor de desenvolvimento e no build
 * do e2e (`vite build --mode e2e`). No build de produção a constante é false e o código some.
 */
export const DEV_TOOLS = import.meta.env.DEV || import.meta.env.MODE === 'e2e';

/** O que a partida deixa na janela para o e2e (só com DEV_TOOLS). */
export interface DevWindow {
  __vhResult?: GameResult;
  /** A gravação da entrega (?gravar), ou por que não saiu. */
  __vhRecording?: Recording | RecordingError;
  /** Para cada leitura do Ouvido, quanto ela levou da amostra até o jogo, em segundos no relógio do áudio. */
  __vhPitchLag?: number[];
}

export const devWindow = () => window as Window & DevWindow;
