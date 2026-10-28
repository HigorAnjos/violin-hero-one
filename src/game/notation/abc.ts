// ABC (.abc) → uma melodia (Score) por voz. Parser próprio, só o que o violino precisa: notas, acidentes, oitavas,
// durações (inclusive pontuada > <), pausas, quiálteras, acordes (fica a nota mais aguda), ligaduras de prolongamento,
// compasso, unidade, andamento, armadura (com modos) e repetição simples com 1ª e 2ª casa. Ornamentos, apojaturas,
// cifras, letras e ligaduras de expressão são lidos e ignorados. Só a 1ª música (X:) do arquivo.
import { DEFAULT_KEY, DEFAULT_QUARTER_BPM, tidy, type KeySignature, type ScoreMeasure, type ScoreNote, type ScorePart } from './musicxml.ts';
import { unfoldRepeats, type RepeatMarks } from './repeats.ts';
import type { TimeSignature } from './song.ts';

const UNITS: readonly number[] = [2, 4, 8];
const EPSILON = 1e-6;
const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** Tônica maior → armadura. */
const MAJOR_FIFTHS: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
};
/** Modo → quintas a somar à tônica (menor = 3 bemóis a mais que a maior da mesma tônica). */
const MODE_OFFSET: Record<string, number> = { maj: 0, ion: 0, mix: -1, dor: -2, m: -3, min: -3, aeo: -3, phr: -4, loc: -5, lyd: 1 };
const SHARP_ORDER = 'FCGDAEB';

const fail = (message: string): never => {
  throw new RangeError(`ABC: ${message}`);
};

export const looksLikeAbc = (text: string) => /^\s*K:/m.test(text) && /^\s*(X|T|M|L):/m.test(text);

function parseKey(raw: string): KeySignature {
  const text = raw.trim();
  if (!text || /^(none|hp)\b/i.test(text)) return DEFAULT_KEY;
  const match = /^([A-G])([#b]?)\s*([a-zA-Z]*)/.exec(text);
  if (!match) return fail(`armadura "${raw}" desconhecida`);
  const tonic = match[1] + match[2];
  // palavra que não é modo ("clef=treble", "exp") fica com o maior
  const word = match[3].toLowerCase();
  const offset = MODE_OFFSET[word === 'm' ? 'm' : word.slice(0, 3)] ?? 0;
  const base = MAJOR_FIFTHS[tonic];
  if (base === undefined) return fail(`armadura "${raw}" desconhecida`);
  const fifths = base + offset;
  if (fifths < -7 || fifths > 7) return fail(`armadura "${raw}" fora de 7 acidentes`);
  return { fifths, mode: offset === -3 ? 'minor' : 'major' };
}

/** Alteração (em semitons) de cada letra pela armadura. */
function keyAlters(key: KeySignature): Record<string, number> {
  const alters: Record<string, number> = {};
  for (let i = 0; i < Math.abs(key.fifths); i++) {
    const letter = key.fifths > 0 ? SHARP_ORDER[i] : SHARP_ORDER[6 - i];
    alters[letter] = key.fifths > 0 ? 1 : -1;
  }
  return alters;
}

function parseMeter(raw: string): TimeSignature | null {
  const text = raw.trim();
  if (text === 'C') return { beats: 4, unit: 4 };
  if (text === 'C|') return { beats: 2, unit: 2 };
  if (!text || /^none$/i.test(text)) return null;
  const match = /^(\d+)\s*\/\s*(\d+)/.exec(text);
  if (!match) return fail(`compasso "${raw}" não suportado`);
  const beats = Number(match[1]);
  const unit = Number(match[2]);
  if (beats < 1 || !UNITS.includes(unit)) return fail(`compasso ${beats}/${unit} não suportado`);
  return { beats, unit: unit as TimeSignature['unit'] };
}

/** "1/8" → 0.125 (fração da semibreve). */
function parseFraction(raw: string): number {
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(raw);
  if (!match || Number(match[2]) === 0) return fail(`unidade "${raw}" inválida`);
  return Number(match[1]) / Number(match[2]);
}

/** Andamento em semínimas por minuto: "1/4=120", "3/8=60", ou só "120" (na unidade L). */
function parseTempo(raw: string, unit: number): number | undefined {
  const withBeat = /((?:\d+\/\d+\s*)+)=\s*(\d+(?:\.\d+)?)/.exec(raw);
  if (withBeat) {
    const beat = withBeat[1].trim().split(/\s+/).reduce((sum, f) => sum + parseFraction(f), 0);
    return beat * 4 * Number(withBeat[2]);
  }
  const plain = /^\s*(\d+(?:\.\d+)?)\s*$/.exec(raw);
  return plain ? unit * 4 * Number(plain[1]) : undefined;
}

/** Multiplicador de duração depois da nota: "", "2", "/", "//", "3/2", "/4". */
function parseLength(raw: string): number {
  const match = /^(\d*)(\/*)(\d*)$/.exec(raw);
  if (!match) return fail(`duração "${raw}" inválida`);
  const [, num, slashes, den] = match;
  let value = num ? Number(num) : 1;
  if (slashes) value /= den ? Number(den) * 2 ** (slashes.length - 1) : 2 ** slashes.length;
  else if (den) value = Number(num + den);
  if (!(value > 0)) fail(`duração "${raw}" inválida`);
  return value;
}

/** Ticks por semínima: inteiro divisível por 64, 3, 5, 7 e 9 (quiálteras somam sem resíduo de ponto flutuante). */
const TICKS = 20160;

interface RawMeasure {
  /** Duração em ticks; as notas também. */
  ticks: number;
  meter: TimeSignature | null;
  notes: { start: number; length: number; midi: number; tie: boolean }[];
  marks: RepeatMarks;
  number: number;
}

/** Estado de leitura de uma voz. */
class Voice {
  measures: RawMeasure[] = [];
  current: RawMeasure;
  unit: number;
  meter: TimeSignature | null;
  key: KeySignature;
  alters: Record<string, number>;
  barAlters: Record<string, number> = {};
  pendingMarks: RepeatMarks = {};
  ending: number[] | undefined;
  tieFrom: number | undefined;
  /** Letra e oitava da nota ligada, para a de chegada herdar o acidente. */
  tieSlot: string | undefined;
  tuplet: { factor: number; left: number } | undefined;
  broken = 1;

  constructor(
    readonly id: string,
    public name: string,
    header: { unit: number; meter: TimeSignature | null; key: KeySignature },
  ) {
    this.unit = header.unit;
    this.meter = header.meter;
    this.key = header.key;
    this.alters = keyAlters(header.key);
    this.current = this.fresh();
  }

  fresh(): RawMeasure {
    const marks = this.pendingMarks;
    this.pendingMarks = {};
    if (this.ending) marks.endings = this.ending;
    return { ticks: 0, meter: this.meter, notes: [], marks, number: this.measures.length + 1 };
  }

  setKey(key: KeySignature) {
    this.key = key;
    this.alters = keyAlters(key);
    this.barAlters = {};
  }

  /** Nota ou pausa de `quarters`; `midi` nulo é pausa. */
  add(midi: number | null, quarters: number) {
    let factor = this.broken;
    this.broken = 1;
    if (this.tuplet) {
      factor *= this.tuplet.factor;
      if (--this.tuplet.left === 0) this.tuplet = undefined;
    }
    const length = Math.round(quarters * factor * TICKS);
    if (length <= 0) fail('nota curta demais');
    const start = this.current.ticks;
    this.current.ticks = start + length;
    if (midi === null) {
      this.tieFrom = undefined;
      return;
    }
    const tie = this.tieFrom === midi;
    this.tieFrom = undefined;
    this.current.notes.push({ start, length, midi, tie });
  }

  /** `>` ou `<` depois da nota: a anterior ganha ou perde, a próxima compensa. */
  dot(symbol: string) {
    const last = this.current.notes[this.current.notes.length - 1];
    if (!last || last.start + last.length < this.current.ticks) fail(`"${symbol}" sem nota antes`);
    const strength = 1 - 0.5 ** symbol.length;
    const factor = symbol[0] === '>' ? 1 + strength : 1 - strength;
    const before = last.length;
    last.length = Math.round(before * factor);
    this.current.ticks += last.length - before;
    this.broken = 2 - factor;
  }

  /** Barra: fecha o compasso (vazio só passa as marcas adiante) e aplica repetição e casas. */
  bar(token: string) {
    const backward = token.startsWith(':');
    const forward = token.endsWith(':');
    const endingMatch = /(\d[\d,-]*)$/.exec(token);
    const closesEnding = backward || forward || token.includes('||') || token.includes('|]') || token.includes('[|');
    const empty = this.current.ticks === 0 && this.current.notes.length === 0;
    if (empty) {
      if (backward) {
        const previous = this.measures[this.measures.length - 1];
        if (previous) previous.marks.backward = true;
      }
      this.pendingMarks = { ...this.current.marks, ...this.pendingMarks };
      delete this.pendingMarks.endings;
    } else {
      if (backward) this.current.marks.backward = true;
      this.measures.push(this.current);
    }
    this.barAlters = {};
    if (closesEnding) this.ending = undefined;
    if (forward) this.pendingMarks.forward = true;
    if (endingMatch) this.ending = endingNumbers(endingMatch[1]);
    this.current = this.fresh();
  }

  finish() {
    if (this.current.ticks > 0 || this.current.notes.length) this.measures.push(this.current);
  }
}

function endingNumbers(raw: string): number[] {
  return raw.split(',').flatMap((part) => {
    const [a, b] = part.split('-').map(Number);
    return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a];
  });
}

const DEFAULT_TUPLET_Q: Record<number, number> = { 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 };

/** Lê a música do corpo de uma voz, token por token. */
function readBody(text: string, voice: Voice, onField: (field: string, value: string) => void) {
  let i = 0;
  const peek = (re: RegExp) => {
    re.lastIndex = i;
    const m = re.exec(text);
    return m && m.index === i ? m : null;
  };
  const NOTE = /(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)/y;
  const REST = /([zx])(\d*\/*\d*)/y;
  const MULTI_REST = /([ZX])(\d*)/y;
  const BAR = /(:*\|[\]|:]?|\[\||::)(\s*\[?\d[\d,-]*)?|\[(\d[\d,-]*)/y;
  const FIELD = /\[([A-Za-z]):([^\]]*)\]/y;
  const TUPLET = /\((\d)(?::(\d?))?(?::(\d?))?/y;

  const pitch = (accidental: string | undefined, letter: string, octaves: string): number => {
    const upper = letter.toUpperCase();
    let octave = letter === upper ? 4 : 5;
    for (const c of octaves) octave += c === "'" ? 1 : -1;
    const slot = `${upper}${octave}`;
    if (accidental) voice.barAlters[slot] = { '^^': 2, '^': 1, '=': 0, _: -1, __: -2 }[accidental]!;
    // nota ligada por cima da barra mantém o acidente da anterior
    else if (voice.tieFrom !== undefined && voice.tieSlot === slot && !(slot in voice.barAlters)) return voice.tieFrom;
    const alter = voice.barAlters[slot] ?? voice.alters[upper] ?? 0;
    return (octave + 1) * 12 + STEP_SEMITONES[upper] + alter;
  };
  const tie = (midi: number, letter: string, octaves: string) => {
    voice.tieFrom = midi;
    let octave = letter === letter.toUpperCase() ? 4 : 5;
    for (const c of octaves) octave += c === "'" ? 1 : -1;
    voice.tieSlot = `${letter.toUpperCase()}${octave}`;
  };

  while (i < text.length) {
    const c = text[i];
    let m: RegExpExecArray | null;
    if (/\s|`/.test(c) || c === ')' || c === '\\') {
      i++;
    } else if (c === '"') {
      const end = text.indexOf('"', i + 1);
      i = end < 0 ? text.length : end + 1;
    } else if (c === '!' || c === '+') {
      const end = text.indexOf(c, i + 1);
      if (end < 0) fail(`ornamento ${c}…${c} sem fim`);
      i = end + 1;
    } else if (c === '{') {
      const end = text.indexOf('}', i + 1);
      if (end < 0) fail('apojatura {…} sem fim');
      i = end + 1;
    } else if ('.~HLMOPSTuvJR'.includes(c)) {
      i++;
    } else if ((m = peek(FIELD))) {
      onField(m[1], m[2]);
      i += m[0].length;
    } else if ((m = peek(BAR))) {
      voice.bar((m[1] ?? '|') + (m[2] ?? m[3] ?? '').replace(/[\s[]/g, ''));
      i += m[0].length;
    } else if (c === '[') {
      // acorde: fica a nota mais aguda, com a duração da primeira
      const end = text.indexOf(']', i);
      if (end < 0) fail('acorde […] sem fim');
      const inner = text.slice(i + 1, end);
      let best: { midi: number; length: number } | undefined;
      for (const n of inner.matchAll(/(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)-?/g)) {
        const midi = pitch(n[1], n[2], n[3]);
        const length = parseLength(n[4]);
        if (!best) best = { midi, length };
        else best.midi = Math.max(best.midi, midi);
      }
      i = end + 1;
      const outer = peek(/(\d*\/*\d*)/y)!;
      i += outer[0].length;
      if (!best) continue;
      voice.add(best.midi, voice.unit * 4 * best.length * parseLength(outer[1]));
      if (text[i] === '-') {
        voice.tieFrom = best.midi;
        voice.tieSlot = undefined;
        i++;
      }
    } else if ((m = peek(TUPLET))) {
      const p = Number(m[1]);
      const q = m[2] ? Number(m[2]) : (DEFAULT_TUPLET_Q[p] ?? 2);
      const r = m[3] ? Number(m[3]) : p;
      voice.tuplet = { factor: q / p, left: r };
      i += m[0].length;
    } else if (c === '(') {
      i++;
    } else if ((m = peek(NOTE))) {
      const midi = pitch(m[1], m[2], m[3]);
      voice.add(midi, voice.unit * 4 * parseLength(m[4]));
      i += m[0].length;
      if (text[i] === '-') {
        tie(midi, m[2], m[3]);
        i++;
      }
    } else if ((m = peek(REST))) {
      voice.add(null, voice.unit * 4 * parseLength(m[2]));
      i += m[0].length;
    } else if ((m = peek(MULTI_REST))) {
      const count = m[2] ? Number(m[2]) : 1;
      const meter = voice.meter ?? { beats: 4, unit: 4 };
      for (let k = 0; k < count; k++) {
        voice.add(null, (meter.beats * 4) / meter.unit);
        if (k < count - 1) voice.bar('|');
      }
      i += m[0].length;
    } else if (c === '>' || c === '<') {
      const run = peek(/[<>]+/y)![0];
      voice.dot(run);
      i += run.length;
    } else if (c === '-') {
      i++;
    } else {
      fail(`símbolo "${c}" não reconhecido`);
    }
  }
}

/** "1 name="Violino" clef=treble" → id e nome. */
function voiceField(value: string): { id: string; name?: string } {
  const [id = '', ...rest] = value.trim().split(/\s+/);
  return { id, name: /(?:name|nm)="([^"]*)"/.exec(rest.join(' '))?.[1] };
}

/** A 1ª música do texto: de X: até a próxima X: (ou o fim). */
function firstTune(source: string): string[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^X:/.test(l));
  const from = start < 0 ? 0 : start;
  const next = lines.findIndex((l, i) => i > from && /^X:/.test(l));
  return lines.slice(from, next < 0 ? undefined : next);
}

export function parseAbcParts(source: string, fallbackTitle: string): ScorePart[] {
  const lines = firstTune(source);
  const header: Record<string, string> = {};
  const voiceNames = new Map<string, string>();
  let i = 0;
  // cabeçalho: até o K:
  for (; i < lines.length; i++) {
    const line = lines[i].replace(/%.*$/, '').trim();
    const field = /^([A-Za-z]):(.*)$/.exec(line);
    if (!field) continue;
    if (field[1] === 'V') {
      const { id, name } = voiceField(field[2]);
      if (name) voiceNames.set(id, name);
    }
    if (!(field[1] in header)) header[field[1]] = field[2].trim();
    if (field[1] === 'K') {
      i++;
      break;
    }
  }
  if (header.K === undefined) fail('sem armadura (K:)');
  const meter = header.M !== undefined ? parseMeter(header.M) : null;
  const ratio = meter ? meter.beats / meter.unit : 1;
  const unit = header.L !== undefined ? parseFraction(header.L) : ratio < 0.75 ? 1 / 16 : 1 / 8;
  const key = parseKey(header.K);
  const tempo = (header.Q !== undefined ? parseTempo(header.Q, unit) : undefined) ?? DEFAULT_QUARTER_BPM;
  const title = header.T || fallbackTitle;
  const composer = header.C ?? '';

  const voices = new Map<string, Voice>();
  const voiceFor = (id: string, name?: string) => {
    let v = voices.get(id);
    if (!v) {
      v = new Voice(id, name || voiceNames.get(id) || (id === '' ? title : `Voz ${id}`), { unit, meter, key });
      voices.set(id, v);
    } else if (name) v.name = name;
    return v;
  };
  let voice = voiceFor('');
  const onField = (field: string, value: string) => {
    if (field === 'K') voice.setKey(parseKey(value));
    else if (field === 'L') voice.unit = parseFraction(value);
    else if (field === 'M') {
      voice.meter = parseMeter(value);
      // [M:] logo depois da barra vale para o compasso que começa
      if (voice.current.ticks === 0) voice.current.meter = voice.meter;
    }
    else if (field === 'V') {
      const { id, name } = voiceField(value);
      // voz declarada antes de qualquer nota toma o lugar da voz sem nome
      if (voices.size === 1 && voices.has('') && voice.measures.length === 0 && voice.current.notes.length === 0) voices.delete('');
      voice = voiceFor(id, name);
    }
  };

  for (; i < lines.length; i++) {
    let line = lines[i].replace(/%.*$/, '');
    if (!line.trim()) continue;
    const field = /^([A-Za-z]):(.*)$/.exec(line.trim());
    if (field) {
      if ('KLMV'.includes(field[1])) onField(field[1], field[2]);
      continue;
    }
    line = line.replace(/\\\s*$/, ' ');
    readBody(line, voice, onField);
  }

  const parts: ScorePart[] = [];
  for (const v of voices.values()) {
    v.finish();
    const unfolded = unfoldRepeats(v.measures, (m) => m.marks);
    const songMeter = meter ?? unfolded.find((m) => m.meter)?.meter ?? { beats: 4, unit: 4 };
    let widest = songMeter.beats;
    const measures: ScoreMeasure[] = unfolded.map((m) => {
      const toBeats = (ticks: number) => tidy((ticks / TICKS) * (songMeter.unit / 4));
      const beats = toBeats(m.ticks);
      if (m.meter) {
        const declared = toBeats(((m.meter.beats * 4) / m.meter.unit) * TICKS);
        if (beats > declared + EPSILON) fail(`compasso ${m.number}: ${beats} tempos não cabem em ${m.meter.beats}/${m.meter.unit}`);
        widest = Math.max(widest, Math.ceil(declared - EPSILON));
      }
      widest = Math.max(widest, Math.ceil(beats - EPSILON));
      return {
        beats,
        notes: m.notes.map((n) => {
          const note: ScoreNote = { beat: toBeats(n.start), beats: toBeats(n.length), midi: n.midi };
          if (n.tie) note.tie = true;
          return note;
        }),
      };
    });
    parts.push({
      id: v.id || 'melodia',
      name: v.name,
      score: {
        title,
        composer,
        key,
        bpm: tidy((tempo * songMeter.unit) / 4),
        timeSignature: { beats: widest, unit: songMeter.unit },
        measures: measures.filter((m) => m.beats > 0),
      },
    });
  }
  return parts;
}
