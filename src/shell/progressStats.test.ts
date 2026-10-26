import { describe, expect, it } from 'vitest';
import { shiftDay } from '../services/history';
import { formatDuration, lastDays, learnedSongs, stringTrend, tuningAverage } from './progressStats';

const TODAY = '2026-10-26';
// Meio-dia em Brasília: o dia da partida não muda com o fuso de quem roda o teste
const playOn = (daysAgo: number, cents: (number | null)[]) => ({ playedAt: `${shiftDay(TODAY, daysAgo)}T15:00:00Z`, stringCents: cents });

describe('estatísticas do perfil', () => {
  it('shiftDay atravessa mês e ano', () => {
    expect(shiftDay('2026-03-01', 1)).toBe('2026-02-28');
    expect(shiftDay('2026-01-01', 1)).toBe('2025-12-31');
  });

  it('lastDays: um valor por dia até hoje, 0 sem partida', () => {
    expect(lastDays([{ day: TODAY, seconds: 60 }, { day: '2026-10-24', seconds: 120 }, { day: '2026-10-01', seconds: 9 }], TODAY, 3)).toEqual([120, 0, 60]);
  });

  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(35 * 60)).toBe('35 min');
    expect(formatDuration(142 * 60)).toBe('2h 22min');
    expect(formatDuration(120 * 60)).toBe('2h');
  });

  it('músicas aprendidas: 90% ou mais no Médio ou Difícil, cada música uma vez', () => {
    expect(
      learnedSongs([
        { songId: 'a', level: 'medium', accuracy: 92 },
        { songId: 'a', level: 'hard', accuracy: 95 },
        { songId: 'b', level: 'easy', accuracy: 100 },
        { songId: 'c', level: 'medium', accuracy: 89.9 },
        { songId: 'd', level: 'hard' },
      ])
    ).toBe(1);
  });

  it('afinação média desta semana e de 3 semanas atrás, ignorando corda sem nota', () => {
    const plays = [playOn(0, [10, -20, null, 0]), playOn(6, [5, 5, 5, 5]), playOn(10, [50, 50, 50, 50]), playOn(25, [16, -16, 16, -16])];
    expect(tuningAverage(plays, TODAY)).toEqual({ now: (10 + 20 + 0 + 5 * 4) / 7, before: 16 });
    expect(tuningAverage([], TODAY)).toEqual({ now: null, before: null });
  });

  it('tendência por corda: 4 semanas, da mais antiga para esta', () => {
    const plays = [playOn(22, [20, 10, 14, 20]), playOn(1, [3, 2, 8, -12])];
    const trend = stringTrend(plays, TODAY);
    expect(trend[0]).toEqual([20, null, null, 3]);
    expect(trend[3]).toEqual([20, null, null, 12]);
  });
});
