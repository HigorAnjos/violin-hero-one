import React from 'react';
import { micTrouble, type MicTrouble, type PitchListener } from '../game/audio';

export type LevelListener = (dbfs: number) => void;

/**
 * O que as telas precisam do Ouvido. A implementação real é o microphoneEar (src/game/audio);
 * as telas recebem a porta pelo EarProvider e os testes passam uma falsa.
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

/** Os três estados da tela MicTrouble (5e). */
export type MicProblem = 'no-sound' | 'noisy' | 'blocked';

/** Sem acesso ao microfone vai para "bloqueado"; microfone que existe mas não chega som, para "sem som". */
export const TROUBLE_SCREEN: Record<MicTrouble, MicProblem> = {
  denied: 'blocked',
  insecure: 'blocked',
  unsupported: 'blocked',
  'audio-blocked': 'blocked',
  'no-device': 'no-sound',
  'in-use': 'no-sound',
  unknown: 'no-sound',
};

/** Erro do navegador ao pedir o microfone: a causa exata (do Ouvido) e a tela que a mostra. */
export function micFailure(error: unknown): { problem: MicProblem; cause: MicTrouble } {
  const cause = micTrouble(error);
  return { problem: TROUBLE_SCREEN[cause], cause };
}

/** Sem EarProvider (testes de componente isolado): o navegador "não oferece" microfone, sem quebrar a tela. */
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
