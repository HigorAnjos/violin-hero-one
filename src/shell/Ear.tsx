import React from 'react';
import type { PitchListener } from '../game/audio/types';

export type LevelListener = (dbfs: number) => void;

/**
 * O que as telas precisam do Ouvido (floor ciclo1-ouvido). A implementação real entra na
 * integração; até lá as telas recebem esta porta pelo EarProvider (testes passam uma falsa).
 */
export interface Ear {
  /** Pede o microfone e começa a ouvir. Rejeita com o erro do navegador (NotAllowedError, NotFoundError…). */
  start(): Promise<void>;
  stop(): void;
  /** Leituras de afinação, no contrato PitchReading. Devolve a função que cancela. */
  onPitch(listener: PitchListener): () => void;
  /** Nível de entrada bruto em dBFS, com ou sem nota clara (~30 vezes por segundo). */
  onLevel(listener: LevelListener): () => void;
}

export type MicProblem = 'no-sound' | 'noisy' | 'blocked';

/** Erro do navegador ao pedir o microfone, traduzido para o problema mostrado ao jogador. */
export function micProblemFromError(error: unknown): MicProblem {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'NotSupportedError' ? 'blocked' : 'no-sound';
}

/** Enquanto o Ouvido não está ligado: o navegador "não oferece" microfone, sem quebrar a tela. */
export const unwiredEar: Ear = {
  start: () => Promise.reject(new DOMException('ouvido ainda não ligado', 'NotSupportedError')),
  stop: () => undefined,
  onPitch: () => () => undefined,
  onLevel: () => () => undefined,
};

const EarContext = React.createContext<Ear>(unwiredEar);

export const EarProvider: React.FC<{ ear: Ear; children: React.ReactNode }> = ({ ear, children }) => (
  <EarContext.Provider value={ear}>{children}</EarContext.Provider>
);

export function useEar(): Ear {
  return React.useContext(EarContext);
}
