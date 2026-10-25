export interface OutputStamp {
  contextTime: number;
  performanceTime: number;
}

/**
 * Converte performance.now() para o relógio de saída do AudioContext. Ressincronizado com getOutputTimestamp algumas
 * vezes por segundo, para cada quadro ler a hora sem alocar; nunca anda para trás.
 */
export class AudioClock {
  private contextTime = 0;
  private performanceTime = 0;
  private synced = false;
  private last = -Infinity;

  sync(stamp: OutputStamp): void {
    this.contextTime = stamp.contextTime;
    this.performanceTime = stamp.performanceTime;
    this.synced = true;
  }

  /** Esquece o piso monotônico, ex.: depois de suspender e retomar o contexto. */
  reset(): void {
    this.synced = false;
    this.last = -Infinity;
  }

  get isSynced(): boolean {
    return this.synced;
  }

  now(performanceNow: number): number {
    const t = this.contextTime + (performanceNow - this.performanceTime) / 1000;
    if (t > this.last) this.last = t;
    return this.last;
  }
}

/** Carimbo de reserva quando getOutputTimestamp falta ou ainda não roda: currentTime menos as latências de saída. */
export function fallbackStamp(
  currentTime: number,
  outputLatency: number | undefined,
  baseLatency: number | undefined,
  performanceNow: number,
): OutputStamp {
  return { contextTime: currentTime - (outputLatency ?? 0) - (baseLatency ?? 0), performanceTime: performanceNow };
}

export const MAX_STAMP_AGE_MS = 250;

/**
 * getOutputTimestamp devolve zeros até o áudio fluir, e pode devolver um carimbo de antes de uma pausa; extrapolar
 * esse adiantaria o relógio pelo tempo parado e congelaria a pista.
 */
export function isUsableStamp(stamp: Partial<OutputStamp> | undefined, performanceNow: number): stamp is OutputStamp {
  if (!stamp || typeof stamp.contextTime !== 'number' || typeof stamp.performanceTime !== 'number') return false;
  if (stamp.performanceTime <= 0) return false;
  return Math.abs(performanceNow - stamp.performanceTime) <= MAX_STAMP_AGE_MS;
}
