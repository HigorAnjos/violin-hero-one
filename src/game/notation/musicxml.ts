// MusicXML (partwise) → melodia neutra (Score): a 1ª voz de uma parte, a nota mais aguda de cada acorde.
// Os níveis (levels.ts) saem do Score; aqui não há dedilhado nem simplificação.
// Imports com extensão .ts: a Edge Function import-song (Deno) lê estes mesmos arquivos.
import { unfoldRepeats, type RepeatMarks } from './repeats.ts';
import type { TimeSignature } from './song.ts';
import { child, children, parseXml, textAt, type XmlElement } from './xml.ts';

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

/** Uma parte (instrumento ou voz) da partitura, já como melodia. */
export interface ScorePart {
  id: string;
  name: string;
  /** Programa General MIDI (0 a 127), quando o arquivo diz; 40 é violino. */
  instrument?: number;
  score: Score;
}

/**
 * `lenient` (arquivo importado pelo jogador): repetição simples é desdobrada, a 1ª tonalidade e o 1º andamento valem
 * para a música toda, compasso maior que o do início alarga a fórmula, e sem andamento, armadura ou fórmula valem
 * 100 bpm, Dó maior e 4/4. Sem `lenient` (catálogo), cada um desses casos é erro: a partitura do catálogo é corrigida
 * na fonte.
 */
export interface MusicXmlOptions {
  lenient?: boolean;
}

export const DEFAULT_QUARTER_BPM = 100;
export const DEFAULT_KEY: KeySignature = { fifths: 0, mode: 'major' };
const DEFAULT_TIME: TimeSignature = { beats: 4, unit: 4 };

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const UNITS: readonly number[] = [2, 4, 8];
const EPSILON = 1e-6;

/** Arredonda resíduos de ponto flutuante (tercinas continuam como dízima). */
export const tidy = (value: number) => Math.round(value * 1e9) / 1e9;

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

/** Compasso lido, em divisões, antes de desdobrar as repetições. */
interface RawMeasure {
  where: string;
  divisions: number;
  time: TimeSignature;
  extent: number;
  notes: { start: number; length: number; midi: number; tieStop: boolean }[];
  marks: RepeatMarks;
}

interface RawPart {
  key?: KeySignature;
  time?: TimeSignature;
  tempo?: number;
  measures: RawMeasure[];
}

function readPart(part: XmlElement, lenient: boolean): RawPart {
  let divisions = 0;
  let key: KeySignature | undefined;
  let songTime: TimeSignature | undefined;
  let measureTime: TimeSignature | undefined;
  let tempo: number | undefined;
  let voice: string | undefined;
  let ending: number[] | undefined;
  const measures: RawMeasure[] = [];

  for (const [index, measure] of children(part, 'measure').entries()) {
    const where = `compasso ${measure.attributes.number ?? index + 1}`;
    const marks: RepeatMarks = {};
    let endingStops = false;
    for (const barline of children(measure, 'barline')) {
      const repeat = child(barline, 'repeat');
      const end = child(barline, 'ending');
      if (!lenient && (repeat || end)) throw new RangeError(`MusicXML: ${where}: repetição não suportada, escreva por extenso`);
      if (repeat?.attributes.direction === 'forward') marks.forward = true;
      if (repeat?.attributes.direction === 'backward') marks.backward = true;
      if (end?.attributes.type === 'start') {
        ending = (end.attributes.number ?? '').split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isInteger);
      } else if (end) endingStops = true;
    }
    if (ending?.length) marks.endings = ending;
    if (endingStops) ending = undefined;

    // cursor e extensão em divisões; a nota guarda o início em divisões até o fim do compasso
    let cursor = 0;
    let extent = 0;
    const raw: RawMeasure['notes'] = [];
    let last: (typeof raw)[number] | undefined;

    for (const element of measure.children) {
      const measureTempo = quarterTempo(element);
      if (measureTempo !== undefined) {
        if (tempo !== undefined && Math.abs(tempo - measureTempo) > EPSILON && !lenient) {
          throw new RangeError(`MusicXML: ${where}: mudança de andamento não cabe no Song v1`);
        }
        tempo ??= measureTempo;
      }
      if (element.name === 'attributes') {
        const div = textAt(element, 'divisions');
        if (div !== undefined) divisions = num(div, 'divisions');
        const k = child(element, 'key');
        if (k) {
          const next: KeySignature = { fifths: num(textAt(k, 'fifths'), 'armadura'), mode: textAt(k, 'mode') === 'minor' ? 'minor' : 'major' };
          if (key && (key.fifths !== next.fifths || key.mode !== next.mode) && !lenient) {
            throw new RangeError(`MusicXML: ${where}: mudança de tonalidade não suportada`);
          }
          key ??= next;
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

    if (lenient && !measureTime) {
      measureTime = DEFAULT_TIME;
      songTime ??= DEFAULT_TIME;
    }
    if (!songTime || !measureTime) throw new RangeError(`MusicXML: ${where}: sem fórmula de compasso`);
    if (!divisions) {
      if (extent === 0) continue;
      throw new RangeError(`MusicXML: ${where}: sem <divisions>`);
    }
    measures.push({ where, divisions, time: measureTime, extent, notes: raw, marks });
  }
  return { key, time: songTime, tempo, measures };
}

/** Score de uma parte lida: tempos na unidade do compasso da música, repetições já desdobradas. */
function toScore(part: RawPart, header: { title: string; composer: string; tempo?: number }, lenient: boolean): Score {
  if (!part.key && !lenient) throw new RangeError('MusicXML: sem armadura de clave (<key>)');
  if (!part.time && !lenient) throw new RangeError('MusicXML: sem fórmula de compasso (<time>)');
  const tempo = part.tempo ?? header.tempo ?? (lenient ? DEFAULT_QUARTER_BPM : undefined);
  if (tempo === undefined) throw new RangeError('MusicXML: sem andamento (<sound tempo> ou <metronome>)');
  const songTime = part.time ?? DEFAULT_TIME;
  let widest = songTime.beats;
  const measures: ScoreMeasure[] = [];
  for (const m of lenient ? unfoldRepeats(part.measures, (r) => r.marks) : part.measures) {
    // tempos na unidade do compasso da música: semínimas × unidade / 4
    const toBeats = (div: number) => tidy(((div / m.divisions) * songTime.unit) / 4);
    const beats = toBeats(m.extent);
    const declared = tidy((((m.time.beats * 4) / m.time.unit) * songTime.unit) / 4);
    if (beats > declared + EPSILON) throw new RangeError(`MusicXML: ${m.where}: ${beats} tempos não cabem em ${m.time.beats}/${m.time.unit}`);
    if (declared > songTime.beats + EPSILON) {
      if (!lenient) {
        throw new RangeError(
          `MusicXML: ${m.where}: compasso ${m.time.beats}/${m.time.unit} maior que o ${songTime.beats}/${songTime.unit} do início não cabe no Song v1`,
        );
      }
      widest = Math.max(widest, Math.ceil(declared - EPSILON));
    }
    if (beats <= 0) continue;
    measures.push({
      beats,
      notes: m.notes.map((n) => {
        const note: ScoreNote = { beat: toBeats(n.start), beats: toBeats(n.length), midi: n.midi };
        if (n.tieStop) note.tie = true;
        return note;
      }),
    });
  }
  return {
    title: header.title,
    composer: header.composer,
    key: part.key ?? DEFAULT_KEY,
    bpm: tidy((tempo * songTime.unit) / 4),
    timeSignature: { beats: widest, unit: songTime.unit },
    measures,
  };
}

/** Título: no catálogo, o da obra; no importado, o do movimento (a canção dentro do ciclo), quando houver. */
function readHeader(root: XmlElement, lenient: boolean) {
  if (root.name !== 'score-partwise') throw new RangeError(`MusicXML: esperado <score-partwise>, veio <${root.name}>`);
  const work = textAt(root, 'work', 'work-title');
  const movement = textAt(root, 'movement-title');
  const title = ((lenient ? movement || work : work || movement) ?? '').trim();
  const composer = (children(child(root, 'identification'), 'creator').find((c) => c.attributes.type === 'composer')?.text ?? '').trim();
  return { title, composer };
}

/** A 1ª parte da partitura (o formato do catálogo). */
export function parseMusicXml(source: string, options: MusicXmlOptions = {}): Score {
  const root = parseXml(source);
  const header = readHeader(root, !!options.lenient);
  const part = child(root, 'part');
  if (!part) throw new RangeError('MusicXML: partitura sem <part>');
  return toScore(readPart(part, !!options.lenient), header, !!options.lenient);
}

/**
 * Todas as partes, com o nome do <part-list>. Andamento escrito só numa parte (costuma ser a 1ª) vale para todas.
 * Por padrão `lenient`: é a entrada dos arquivos importados.
 */
export function parseMusicXmlParts(source: string, options: MusicXmlOptions = { lenient: true }): ScorePart[] {
  const lenient = !!options.lenient;
  const root = parseXml(source);
  const header = readHeader(root, lenient);
  const listed = new Map(children(child(root, 'part-list'), 'score-part').map((p) => [p.attributes.id, p]));
  const raw = children(root, 'part').map((part) => ({ id: part.attributes.id ?? '', part: readPart(part, lenient) }));
  if (!raw.length) throw new RangeError('MusicXML: partitura sem <part>');
  const tempo = raw.find((r) => r.part.tempo !== undefined)?.part.tempo;
  return raw.map(({ id, part }, i) => {
    const entry = listed.get(id);
    // <midi-program> conta de 1 a 128
    const program = Number(textAt(entry, 'midi-instrument', 'midi-program'));
    const scorePart: ScorePart = {
      id: id || `P${i + 1}`,
      name: (textAt(entry, 'part-name') ?? '').replace(/\s+/g, ' ').trim() || `Parte ${i + 1}`,
      score: toScore(part, { ...header, tempo }, lenient),
    };
    if (Number.isInteger(program) && program >= 1 && program <= 128) scorePart.instrument = program - 1;
    return scorePart;
  });
}
