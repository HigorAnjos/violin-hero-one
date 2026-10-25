import React from 'react';
import type { Ear } from '../../shell/Ear';
import { MIN_CLARITY } from '../OpenStringCard/openStringCheck';

export const SILENCE_DB = -100;
/** Faixa útil do medidor: abaixo de -60 dBFS é silêncio para o jogo. */
const METER_FLOOR_DB = -60;

export type MeterTone = 'info' | 'warning' | 'danger';
export interface MeterView {
  fraction: number;
  word: string;
  tone: MeterTone;
}

export function meterFraction(db: number): number {
  if (!(db > METER_FLOOR_DB)) return 0;
  return Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB);
}

/** Volume do violino: fraco demais o jogo não ouve; alto demais o microfone satura. */
export function volumeView(db: number): MeterView {
  const fraction = meterFraction(db);
  if (db < -45) return { fraction, word: 'baixo', tone: 'warning' };
  if (db > -6) return { fraction, word: 'alto', tone: 'warning' };
  return { fraction, word: 'bom', tone: 'info' };
}

/** Ruído do ambiente: o nível medido quando nenhuma nota clara está soando. */
export function noiseView(db: number): MeterView {
  const fraction = meterFraction(db);
  if (db < -50) return { fraction, word: 'baixo', tone: 'info' };
  if (db < -38) return { fraction, word: 'médio', tone: 'warning' };
  return { fraction, word: 'alto', tone: 'danger' };
}

const VOLUME_SMOOTHING = 0.3;
const NOISE_SMOOTHING = 0.1;

/** Volume (com nota clara) e ruído (sem nota), suavizados, a partir do Ouvido. */
export function useSoundMeters(ear: Ear): { volumeDb: number; noiseDb: number } {
  const [meters, setMeters] = React.useState({ volumeDb: SILENCE_DB, noiseDb: SILENCE_DB });
  React.useEffect(() => {
    let clear = false;
    const offPitch = ear.onPitch((reading) => {
      clear = reading !== null && reading.clarity >= MIN_CLARITY;
    });
    const offLevel = ear.onLevel((db) => {
      setMeters((m) =>
        clear
          ? { ...m, volumeDb: m.volumeDb + (db - m.volumeDb) * VOLUME_SMOOTHING }
          : { volumeDb: m.volumeDb + (SILENCE_DB - m.volumeDb) * VOLUME_SMOOTHING, noiseDb: m.noiseDb + (db - m.noiseDb) * NOISE_SMOOTHING }
      );
    });
    return () => {
      offPitch();
      offLevel();
    };
  }, [ear]);
  return meters;
}
