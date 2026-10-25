// Contrato entre o Ouvido (src/game/audio) e o Motor (src/game/engine). Os dois floors do ciclo 1
// trabalham em paralelo em cima destes tipos; mudar aqui é decisão registrada em Decisões.

/** Uma leitura de afinação, emitida a cada ~10 ms enquanto o som está claro. */
export interface PitchReading {
  /** Tempo do AudioContext, em segundos, da última amostra analisada. Sem compensação de latência. */
  time: number;
  /** Frequência fundamental suavizada (mediana). */
  hz: number;
  /** Nota temperada mais próxima no Lá atual. */
  midi: number;
  /** Desvio de `midi` em cents no Lá atual; normalmente entre -50 e 50. */
  cents: number;
  /** Clareza da detecção (McLeod), de 0 a 1. */
  clarity: number;
  /** Nível RMS do último trecho (~10 ms), em dBFS: acompanha troca de arco mais rápido que a altura. */
  level: number;
}

/**
 * Recebe cada leitura, ou `null` uma vez quando o som deixa de ser claro (fim do ataque atual).
 * O Motor desconta a latência calibrada de `time`; o Ouvido não compensa nada.
 */
export type PitchListener = (reading: PitchReading | null) => void;
