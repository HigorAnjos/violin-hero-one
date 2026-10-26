import type { Song } from '../../game/notation/song';

const LETTER: Record<string, string> = { C: 'Dó', D: 'Ré', E: 'Mi', F: 'Fá', G: 'Sol', A: 'Lá', B: 'Si' };
const ACCIDENTAL: Record<string, string> = { '#': '♯', '♯': '♯', b: '♭', '♭': '♭' };

/** "D major" → "Ré maior"; "F# minor" → "Fá♯ menor". Formato desconhecido volta como veio. */
export function keyLabel(key: string): string {
  const m = /^([A-G])([#b♯♭]?)\s+(major|minor)$/i.exec(key.trim());
  if (!m) return key;
  return `${LETTER[m[1].toUpperCase()]}${ACCIDENTAL[m[2]] ?? ''} ${m[3].toLowerCase() === 'major' ? 'maior' : 'menor'}`;
}

/** "Partitura · Ré maior · 4/4 · compasso 18 de 64" (o compasso a partir de 1). */
export function sheetCaption(song: Pick<Song, 'key' | 'timeSignature' | 'measures'>, measure: number, prefix = 'Partitura'): string {
  const total = song.measures.length;
  const shown = Math.min(total, Math.max(1, measure + 1));
  return `${prefix} · ${keyLabel(song.key)} · ${song.timeSignature.beats}/${song.timeSignature.unit} · compasso ${shown} de ${total}`;
}
