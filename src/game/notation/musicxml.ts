// MusicXML (partwise) → melodia neutra (Score): a 1ª parte, a 1ª voz, a nota mais aguda de cada acorde.
// Os níveis (levels.ts) saem do Score; aqui não há dedilhado nem simplificação.
import type { TimeSignature } from './song';
import { child, children, parseXml, textAt, type XmlElement } from './xml';

export interface KeySignature {
  /** Sustenidos (positivo) ou bemóis (negativo) da armadura. */
  fifths: number;
  mode: 'major' | 'minor';
}

export interface ScoreNote {
  /** Início, em tempos (unidade do compasso da música) desde o começo do compasso. */
  beat: number;
  beats: number;
  midi: number;
  /** Continua a nota anterior (ligadura de prolongamento), sem novo ataque. */
  tie?: boolean;
}

export interface ScoreMeasure {
  beats: number;
  notes: ScoreNote[];
}

export interface Score {
  title: string;
  composer: string;
  key: KeySignature;
  bpm: number;
  timeSignature: TimeSignature;
  measures: ScoreMeasure[];
}

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const UNITS: readonly number[] = [2, 4, 8];
const EPSILON = 1e-6;

/** Arredonda resíduos de ponto flutuante (tercinas continuam como dízima). */
const tidy = (value: number) => Math.round(value * 1e9) / 1e9;

function num(raw: string | undefined, what: string): number {
  const value = Number(raw);
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(value)) throw new RangeError(`MusicXML: ${what} inválido (${raw})`);
  return value;
}

function pitchMidi(note: XmlElement): number {
  const step = textAt(note, 'pitch', 'step') ?? '';
  if (!(step in STEP_SEMITONES)) throw new RangeError(`MusicXML: nota "${step}" desconhecida`);
  const alter = Math.round(Number(textAt(note, 'pitch', 'alter') ?? 0));
  const octave = num(textAt(note, 'pitch', 'octave'), 'oitava');
  return (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
}

/** Andamento em semínimas por minuto, de um <direction>, <sound> ou <note> do compasso. */
function quarterTempo(element: XmlElement): number | undefined {
  for (const sound of element.name === 'sound' ? [element] : children(element, 'sound')) {
    if (sound.attributes.tempo !== undefined) return num(sound.attributes.tempo, 'andamento');
  }
  if (element.name === 'direction') {
    for (const type of children(element, 'direction-type')) {
      const metronome = child(type, 'metronome');
      const perMinute = textAt(metronome, 'per-minute');
      if (!metronome || perMinute === undefined) continue;
      const unit: Record<string, number> = { whole: 4, half: 2, quarter: 1, eighth: 0.5, '16th': 0.25 };
      const base = unit[textAt(metronome, 'beat-unit') ?? ''];
      if (base === undefined) throw new RangeError(`MusicXML: unidade de metrônomo "${textAt(metronome, 'beat-unit')}" não suportada`);
      const dotted = children(metronome, 'beat-unit-dot').length ? 1.5 : 1;
      return num(perMinute, 'metrônomo') * base * dotted;
    }
  }
  return undefined;
}

export function parseMusicXml(source: string): Score {
  const root = parseXml(source);
  if (root.name !== 'score-partwise') throw new RangeError(`MusicXML: esperado <score-partwise>, veio <${root.name}>`);
  const part = child(root, 'part');
  if (!part) throw new RangeError('MusicXML: partitura sem <part>');

  const title = textAt(root, 'work', 'work-title') ?? textAt(root, 'movement-title') ?? '';
  const composer = children(child(root, 'identification'), 'creator').find((c) => c.attributes.type === 'composer')?.text ?? '';

  let divisions = 0;
  let key: KeySignature | undefined;
  let songTime: TimeSignature | undefined;
  let measureTime: TimeSignature | undefined;
  let tempo: number | undefined;
  let voice: string | undefined;
  const measures: ScoreMeasure[] = [];

  for (const [index, measure] of children(part, 'measure').entries()) {
    const where = `compasso ${measure.attributes.number ?? index + 1}`;
    if (children(measure, 'barline').some((b) => child(b, 'repeat') || child(b, 'ending'))) {
      throw new RangeError(`MusicXML: ${where}: repetição não suportada, escreva por extenso`);
    }
    // cursor e extensão em divisões; a nota guarda o início em divisões até o fim do compasso
    let cursor = 0;
    let extent = 0;
    const raw: { start: number; length: number; midi: number; tieStop: boolean }[] = [];
    let last: (typeof raw)[number] | undefined;

    for (const element of measure.children) {
      const measureTempo = quarterTempo(element);
      if (measureTempo !== undefined) {
        if (tempo !== undefined && Math.abs(tempo - measureTempo) > EPSILON) {
          throw new RangeError(`MusicXML: ${where}: mudança de andamento não cabe no Song v1`);
        }
        tempo = measureTempo;
      }
      if (element.name === 'attributes') {
        const div = textAt(element, 'divisions');
        if (div !== undefined) divisions = num(div, 'divisions');
        const k = child(element, 'key');
        if (k) {
          const next: KeySignature = { fifths: num(textAt(k, 'fifths'), 'armadura'), mode: textAt(k, 'mode') === 'minor' ? 'minor' : 'major' };
          if (key && (key.fifths !== next.fifths || key.mode !== next.mode)) {
            throw new RangeError(`MusicXML: ${where}: mudança de tonalidade não suportada`);
          }
          key = next;
        }
        const time = child(element, 'time');
        if (time) {
          const beats = num(textAt(time, 'beats'), 'compasso');
          const unit = num(textAt(time, 'beat-type'), 'compasso');
          if (!Number.isInteger(beats) || !UNITS.includes(unit)) throw new RangeError(`MusicXML: ${where}: compasso ${beats}/${unit} não suportado`);
          measureTime = { beats, unit: unit as TimeSignature['unit'] };
          songTime ??= measureTime;
        }
      } else if (element.name === 'backup') {
        cursor -= num(textAt(element, 'duration'), 'backup');
      } else if (element.name === 'forward') {
        cursor += num(textAt(element, 'duration'), 'forward');
        extent = Math.max(extent, cursor);
      } else if (element.name === 'note') {
        if (child(element, 'grace') || child(element, 'cue')) continue;
        if (!divisions) throw new RangeError(`MusicXML: ${where}: nota antes de <divisions>`);
        const length = num(textAt(element, 'duration'), 'duração');
        const chord = !!child(element, 'chord');
        const noteVoice = textAt(element, 'voice') ?? '1';
        const rest = !!child(element, 'rest');
        const start = chord && last ? last.start : cursor;
        if (!chord) {
          cursor += length;
          extent = Math.max(extent, cursor);
        }
        if (rest) continue;
        voice ??= noteVoice;
        if (noteVoice !== voice) continue;
        const midi = pitchMidi(element);
        const tieStop = children(element, 'tie').some((t) => t.attributes.type === 'stop');
        if (chord && last && last.start === start) {
          if (midi > last.midi) last.midi = midi;
          continue;
        }
        last = { start, length, midi, tieStop };
        raw.push(last);
      }
    }

    if (!songTime || !measureTime) throw new RangeError(`MusicXML: ${where}: sem fórmula de compasso`);
    // tempos na unidade do compasso da música: semínimas × unidade / 4
    const toBeats = (div: number) => tidy(((div / divisions) * songTime!.unit) / 4);
    const beats = toBeats(extent);
    const declared = tidy((measureTime.beats * 4) / measureTime.unit * songTime.unit / 4);
    if (beats > declared + EPSILON) throw new RangeError(`MusicXML: ${where}: ${beats} tempos não cabem em ${measureTime.beats}/${measureTime.unit}`);
    if (declared > songTime.beats + EPSILON) {
      throw new RangeError(`MusicXML: ${where}: compasso ${measureTime.beats}/${measureTime.unit} maior que o ${songTime.beats}/${songTime.unit} do início não cabe no Song v1`);
    }
    if (beats <= 0) continue;
    measures.push({
      beats,
      notes: raw.map((n) => {
        const note: ScoreNote = { beat: toBeats(n.start), beats: toBeats(n.length), midi: n.midi };
        if (n.tieStop) note.tie = true;
        return note;
      }),
    });
  }

  if (!key) throw new RangeError('MusicXML: sem armadura de clave (<key>)');
  if (!songTime) throw new RangeError('MusicXML: sem fórmula de compasso (<time>)');
  if (tempo === undefined) throw new RangeError('MusicXML: sem andamento (<sound tempo> ou <metronome>)');
  return { title, composer, key, bpm: tidy((tempo * songTime.unit) / 4), timeSignature: songTime, measures };
}
