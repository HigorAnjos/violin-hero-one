// Nível do microfone, separado da detecção de afinação: as telas medem som e ruído mesmo sem nota clara.
// O contrato PitchReading não muda (Decisões).

export const SILENCE_DB = -100;

export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

export function peak(samples: ArrayLike<number>): number {
  let max = 0;
  for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]));
  return max;
}

export function toDbfs(amplitude: number): number {
  if (!(amplitude > 0)) return SILENCE_DB;
  return Math.max(SILENCE_DB, 20 * Math.log10(amplitude));
}

/** dBFS em fração de 0 a 1 para um medidor; abaixo de `minDb` é silêncio. */
export function meterFraction(db: number, minDb = -60): number {
  if (db <= minDb) return 0;
  if (db >= 0) return 1;
  return (db - minDb) / -minDb;
}

/** Sobe na hora e desce em velocidade fixa, como um medidor de mesa de som. */
export function fallOff(previousDb: number, currentDb: number, dtSec: number, fallDbPerSec = 40): number {
  return Math.max(currentDb, previousDb - fallDbPerSec * dtSec);
}

export interface LevelMeterHandle {
  stop(): void;
}

export interface LevelMeterOptions {
  /** Intervalo entre medidas. Padrão ~30 por segundo. */
  intervalMs?: number;
  /** Amostras por medida (potência de 2). Padrão 2048, ~43 ms a 48 kHz. */
  fftSize?: number;
}

/** Mede o nível RMS bruto da fonte (com ou sem nota) e chama `onLevel` com dBFS ~30 vezes por segundo. */
export function startLevelMeter(
  context: BaseAudioContext,
  source: AudioNode,
  onLevel: (dbfs: number) => void,
  { intervalMs = 33, fftSize = 2048 }: LevelMeterOptions = {},
): LevelMeterHandle {
  const analyser = context.createAnalyser();
  analyser.fftSize = fftSize;
  const buffer = new Float32Array(analyser.fftSize);
  source.connect(analyser);
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    onLevel(toDbfs(rms(buffer)));
  }, intervalMs);
  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      source.disconnect(analyser);
    },
  };
}
