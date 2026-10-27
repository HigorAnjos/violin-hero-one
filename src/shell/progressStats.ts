import type { Level } from '../game/notation/song';
import { shiftDay, type PlayDay, type PlayTuning } from '../services/history';
import { todayInBrazil } from '../services/progress';

/** Segundos de cada um dos `n` dias até hoje, do mais antigo para hoje; dia sem partida é 0. */
export function lastDays(days: readonly Pick<PlayDay, 'day' | 'seconds'>[], today: string, n: number): number[] {
  const byDay = new Map(days.map((d) => [d.day, d.seconds]));
  return Array.from({ length: n }, (_, i) => byDay.get(shiftDay(today, n - 1 - i)) ?? 0);
}

/** Quais dos `n` dias até hoje valeram para a sequência (o servidor marca; prática só soma tempo). */
export function markedDays(days: readonly Pick<PlayDay, 'day' | 'marked'>[], today: string, n: number): boolean[] {
  const marked = new Set(days.filter((d) => d.marked).map((d) => d.day));
  return Array.from({ length: n }, (_, i) => marked.has(shiftDay(today, n - 1 - i)));
}

/** "2h 22min", "35 min", "0 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)}h ${rest}min` : `${minutes / 60}h`;
}

/** Música aprendida, como no design: 90% ou mais no Médio (ou no Difícil). */
export const LEARNED_ACCURACY = 90;

export function learnedSongs(records: readonly { songId: string; level: Level; accuracy?: number }[]): number {
  return new Set(records.filter((r) => r.level !== 'easy' && (r.accuracy ?? 0) >= LEARNED_ACCURACY).map((r) => r.songId)).size;
}

const dayOf = (play: PlayTuning) => todayInBrazil(new Date(play.playedAt));

/** Quantos dias antes de `today` a partida foi (0 = hoje). */
function age(play: PlayTuning, today: string): number {
  return Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${dayOf(play)}T12:00:00Z`)) / 86_400_000);
}

function meanAbs(values: readonly (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((sum, v) => sum + Math.abs(v), 0) / present.length : null;
}

/** Desvio médio (¢, sem sinal) de todas as cordas nas partidas de `from` a `to` dias atrás. */
function centsBetween(plays: readonly PlayTuning[], today: string, from: number, to: number, string?: number): number | null {
  const chosen = plays.filter((p) => {
    const a = age(p, today);
    return a >= from && a <= to;
  });
  return meanAbs(chosen.flatMap((p) => (string === undefined ? p.stringCents : [p.stringCents[string] ?? null])));
}

/** Afinação média desta semana e a de 3 semanas atrás ("era ±16 ¢ há um mês"). */
export function tuningAverage(plays: readonly PlayTuning[], today: string = todayInBrazil()): { now: number | null; before: number | null } {
  return { now: centsBetween(plays, today, 0, 6), before: centsBetween(plays, today, 21, 27) };
}

/** Desvio médio de cada corda (Sol Ré Lá Mi) semana a semana, da mais antiga (3 semanas atrás) para esta. */
export function stringTrend(plays: readonly PlayTuning[], today: string = todayInBrazil()): (number | null)[][] {
  return [0, 1, 2, 3].map((s) => [3, 2, 1, 0].map((week) => centsBetween(plays, today, week * 7, week * 7 + 6, s)));
}
