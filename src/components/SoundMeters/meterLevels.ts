import React from 'react';
import { fallOff, meterFraction, SILENCE_DB } from '../../game/audio';
import type { Ear } from '../../shell/Ear';
import { MIN_CLARITY } from '../OpenStringCard/openStringCheck';

export type MeterTone = 'info' | 'warning' | 'danger';
export interface MeterView {
  fraction: number;
  word: string;
  tone: MeterTone;
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

const NOISE_SMOOTHING = 0.1;

/**
 * Volume: o nível de entrada, que sobe na hora e desce devagar (medidor de mesa de som).
 * Ruído: média lenta do nível só enquanto nenhuma nota clara soa.
 */
export function useSoundMeters(ear: Ear): { volumeDb: number; noiseDb: number } {
  const [meters, setMeters] = React.useState({ volumeDb: SILENCE_DB, noiseDb: SILENCE_DB });
  React.useEffect(() => {
    let clear = false;
    let last = Date.now();
    const offPitch = ear.onPitch((reading) => {
      clear = reading !== null && reading.clarity >= MIN_CLARITY;
    });
    const offLevel = ear.onLevel((db) => {
      const now = Date.now();
      const dt = (now - last) / 1000;
      last = now;
      setMeters((m) => ({
        volumeDb: fallOff(m.volumeDb, db, dt),
        noiseDb: clear ? m.noiseDb : m.noiseDb + (db - m.noiseDb) * NOISE_SMOOTHING,
      }));
    });
    return () => {
      offPitch();
      offLevel();
    };
  }, [ear]);
  return meters;
}
