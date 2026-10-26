import { attacks, type Song } from '../../game/notation/song';
import { STRING_LETTERS } from '../../game/notation/violin';

const LETTER: Record<string, string> = { C: 'Dó', D: 'Ré', E: 'Mi', F: 'Fá', G: 'Sol', A: 'Lá', B: 'Si' };
const ACCIDENTAL: Record<string, string> = { '#': '♯', b: '♭', '': '' };

/** "D major" → "Ré maior"; "F# minor" → "Fá♯ menor". Formato fora do esperado volta como veio. */
export function keyLabel(key: string): string {
  const match = /^([A-G])(#|b)? (major|minor)$/.exec(key.trim());
  if (!match) return key;
  const [, letter, accidental = '', mode] = match;
  return `${LETTER[letter]}${ACCIDENTAL[accidental]} ${mode === 'major' ? 'maior' : 'menor'}`;
}

/** 70 → "1:10". */
export function durationLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "Tradicional · 90 BPM · 1:10"; sem compositor, só andamento e duração. */
export function songMeta(sheet: { composer: string; bpm: number; durationSeconds: number }): string {
  return [sheet.composer.trim(), `${Math.round(sheet.bpm)} BPM`, durationLabel(sheet.durationSeconds)].filter(Boolean).join(' · ');
}

/**
 * Selo de quem toca sem internet: "No app" (embutida) ou "Baixada" (já aberta com internet). Sem internet todas
 * na estante são do app ou baixadas, então só a baixada continua marcada.
 */
export function offlineTag(song: { embedded: boolean; saved: boolean }, offline: boolean): string | null {
  if (song.embedded && !offline) return 'No app';
  if (song.saved && !song.embedded) return 'Baixada';
  return null;
}

export interface StringShare {
  letter: (typeof STRING_LETTERS)[number];
  percent: number;
}

/** Parte dos ataques em cada corda, em % inteiros que somam 100 (o resto vai para as maiores sobras). */
export function stringShares(song: Song): StringShare[] {
  const notes = attacks(song);
  const counts = [0, 0, 0, 0];
  for (const note of notes) counts[note.string]++;
  const total = notes.length || 1;
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let rest = notes.length ? 100 - floors.reduce((a, b) => a + b, 0) : 0;
  const order = raw.map((r, i) => [r - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (rest <= 0) break;
    floors[i]++;
    rest--;
  }
  return STRING_LETTERS.map((letter, i) => ({ letter, percent: floors[i] }));
}

export const noteCount = (song: Song) => attacks(song).length;
