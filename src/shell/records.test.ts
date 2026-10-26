import { afterEach, describe, expect, it } from 'vitest';
import type { GameResult, PracticeResult } from '../game/engine';
import { checkRecord, loadRecord, RECORDS_STORAGE_KEY } from './records';

const song = { id: 'ode-a-alegria', level: 'easy' as const };
const result = (score: number, status: GameResult['status'] = 'finished') => ({ score, status }) as GameResult;

describe('records', () => {
  afterEach(() => localStorage.clear());

  it('a primeira partida inteira é o recorde; a seguinte só guarda se passar', () => {
    expect(checkRecord(song, result(1000))).toEqual({ previous: null, improved: true });
    expect(checkRecord(song, result(800))).toEqual({ previous: 1000, improved: false });
    expect(loadRecord(song.id, song.level)).toBe(1000);
    expect(checkRecord(song, result(1500))).toEqual({ previous: 1000, improved: true });
    expect(loadRecord(song.id, song.level)).toBe(1500);
  });

  it('por música e nível do chart', () => {
    checkRecord(song, result(1000));
    expect(loadRecord(song.id, 'hard')).toBeNull();
  });

  it('prática e partida que parou não valem recorde', () => {
    expect(checkRecord(song, { ...result(9000), laps: [], bestLap: null } as PracticeResult)).toBeNull();
    expect(checkRecord(song, result(9000, 'failed'))).toBeNull();
    expect(loadRecord(song.id, song.level)).toBeNull();
  });

  it('lixo no armazenamento vira vazio', () => {
    localStorage.setItem(RECORDS_STORAGE_KEY, '[1,2]');
    expect(loadRecord(song.id, song.level)).toBeNull();
    localStorage.setItem(RECORDS_STORAGE_KEY, '{"ode-a-alegria:easy":"x"}');
    expect(loadRecord(song.id, song.level)).toBeNull();
  });
});
