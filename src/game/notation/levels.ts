// Os 3 níveis a partir da mesma melodia (Score): ritmo, tonalidade e dedilhado de cada um.
import { FIRST_POSITION_RULES, fingerMelody, playable, UP_TO_THIRD_RULES, type FingeringRules, type Position } from './fingering';
import type { KeySignature, Score, ScoreMeasure, ScoreNote } from './musicxml';
import { parseSong, SONG_FORMAT_VERSION, type Level, type Song } from './song';

export interface LevelRules {
  /** Menor figura, em semínimas: ataques fora da grade somem e a nota anterior se estende. Nulo = como escrito. */
  gridQuarters: number | null;
  /** Fácil: leva a música para um tom confortável que caiba na 1ª posição; os outros só mudam de oitava se preciso. */
  comfortableKey: boolean;
  fingering: FingeringRules;
}

export const LEVEL_RULES: Record<Level, LevelRules> = {
  easy: {
    gridQuarters: 0.5,
    comfortableKey: true,
    fingering: FIRST_POSITION_RULES,
  },
  medium: {
    gridQuarters: 0.25,
    comfortableKey: false,
    fingering: UP_TO_THIRD_RULES,
  },
  hard: {
    gridQuarters: null,
    comfortableKey: false,
    fingering: { maxPosition: 3, openCost: 1.5, positionCost: 0.5, shiftCost: 2, crossCost: 1 },
  },
};

const EPSILON = 1e-6;
const tidy = (value: number) => Math.round(value * 1e9) / 1e9;

const MAJOR_TONICS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const MINOR_TONICS = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];

/** "D major", "A minor": o formato de Song.key. */
export function keyName(key: KeySignature): string {
  const tonic = (key.mode === 'minor' ? MINOR_TONICS : MAJOR_TONICS)[key.fifths + 7];
  if (!tonic) throw new RangeError(`armadura ${key.fifths} fora de -7 a 7`);
  return `${tonic} ${key.mode}`;
}

/** Armadura depois de subir `semitones`, escrita com até 6 sustenidos ou 5 bemóis. */
export function transposeKey(key: KeySignature, semitones: number): KeySignature {
  if (semitones === 0) return key;
  const r = (((key.fifths + 7 * semitones) % 12) + 12) % 12;
  return { ...key, fifths: r > 6 ? r - 12 : r };
}

/** Tons confortáveis para quem começa: de Dó a Lá maior (0 a 3 sustenidos), e as relativas menores. */
export const isComfortableKey = (key: KeySignature) => key.fifths >= 0 && key.fifths <= 3;

const allPlayable = (midis: readonly number[], maxPosition: Position, shift: number) =>
  midis.every((midi) => playable(midi + shift, maxPosition));

/**
 * Semitons de transposição do nível: o menor deslocamento que deixa a melodia tocável (e confortável no Fácil).
 * Mudar só de oitava vem antes de mudar de tom.
 */
export function levelShift(score: Score, rules: LevelRules): number {
  const midis = score.measures.flatMap((m) => m.notes.map((n) => n.midi));
  const { maxPosition } = rules.fingering;
  const candidates = rules.comfortableKey ? [...Array(25).keys()].map((i) => i - 12) : [0, -12, 12];
  const changesKey = (s: number) => (s % 12 === 0 ? 0 : 1);
  candidates.sort((a, b) => changesKey(a) - changesKey(b) || Math.abs(a) - Math.abs(b) || a - b);
  const shift = candidates.find(
    (s) => allPlayable(midis, maxPosition, s) && (!rules.comfortableKey || isComfortableKey(transposeKey(score.key, s))),
  );
  if (shift === undefined) throw new RangeError(`a melodia não cabe no violino até a ${maxPosition}ª posição`);
  return shift;
}

/**
 * Ritmo do nível. Ligaduras dentro do compasso viram uma nota só. Com grade, cada ataque cai para o ponto da grade
 * de antes; dois ataques no mesmo ponto ficam com o primeiro, que se estende até onde o outro acabava.
 */
export function simplifyRhythm(measures: readonly ScoreMeasure[], gridBeats: number | null): ScoreMeasure[] {
  const out = measures.map((measure) => {
    const notes: ScoreNote[] = [];
    for (const note of measure.notes) {
      const last = notes[notes.length - 1];
      const end = note.beat + note.beats;
      if (note.tie && last && last.midi === note.midi && Math.abs(last.beat + last.beats - note.beat) < EPSILON) {
        last.beats = tidy(end - last.beat);
        continue;
      }
      const beat = gridBeats ? tidy(Math.floor((note.beat + EPSILON) / gridBeats) * gridBeats) : note.beat;
      if (last && beat <= last.beat + EPSILON) {
        last.beats = tidy(Math.max(last.beat + last.beats, end) - last.beat);
        continue;
      }
      if (last && last.beat + last.beats > beat) last.beats = tidy(beat - last.beat);
      notes.push({ ...note, beat, beats: tidy(end - beat) });
    }
    return { beats: measure.beats, notes };
  });
  // a ligadura só vale se a nota de antes (no compasso anterior) ainda é a mesma e chega colada na barra
  let previous: { end: number; midi: number } | undefined;
  let start = 0;
  for (const measure of out) {
    for (const note of measure.notes) {
      if (note.tie && !(previous && previous.midi === note.midi && Math.abs(previous.end - (start + note.beat)) < EPSILON)) delete note.tie;
      previous = { end: start + note.beat + note.beats, midi: note.midi };
    }
    start += measure.beats;
  }
  return out;
}

/** Song de um nível, validada por parseSong. */
export function levelChart(score: Score, id: string, level: Level): Song {
  const rules = LEVEL_RULES[level];
  const shift = levelShift(score, rules);
  const grid = rules.gridQuarters === null ? null : (rules.gridQuarters * score.timeSignature.unit) / 4;
  const measures = simplifyRhythm(score.measures, grid);
  const flat = measures.flatMap((m) => m.notes.map((n) => ({ midi: n.midi + shift, tie: n.tie })));
  const fingers = fingerMelody(flat, rules.fingering);
  let i = 0;
  const song: Song = {
    formatVersion: SONG_FORMAT_VERSION,
    id,
    title: score.title,
    composer: score.composer,
    key: keyName(transposeKey(score.key, shift)),
    bpm: score.bpm,
    timeSignature: score.timeSignature,
    level,
    measures: measures.map((m) => ({
      beats: m.beats,
      notes: m.notes.map((n) => {
        const { string, finger } = fingers[i++];
        const note = { beat: n.beat, beats: n.beats, midi: n.midi + shift, string, finger };
        return n.tie ? { ...note, tie: true } : note;
      }),
    })),
  };
  return parseSong(song);
}
