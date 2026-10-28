// MIDI (.mid/.midi) → uma melodia (Score) por trilha, pelo @tonejs/midi (MIT). Só roda no servidor (Edge Function
// import-song) e nos testes: o conversor não entra no pacote do app.
// MIDI não tem compasso escrito nem ligadura: a grade vem da fórmula de compasso do arquivo e a nota que cruza a barra
// vira duas, a segunda ligada. Tempos arredondados para 1/24 de semínima (cobre fusa e tercina de semicolcheia).
import * as tonejs from '@tonejs/midi';
import { DEFAULT_KEY, DEFAULT_QUARTER_BPM, tidy, type KeySignature, type ScoreMeasure, type ScoreNote, type ScorePart } from './musicxml.ts';
import type { TimeSignature } from './song.ts';

// O pacote é CommonJS: Node e Vite dão o Midi como export nomeado; o Deno (npm:) só pelo default
const Midi = tonejs.Midi ?? (tonejs as unknown as { default: typeof tonejs }).default.Midi;
type Midi = InstanceType<typeof tonejs.Midi>;

export const isMidi =(bytes: Uint8Array) => bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'MThd';

/** Armaduras como o @tonejs/midi as nomeia (o tom maior da armadura, mesmo em menor), de -7 a 7. */
const KEYS = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
const UNITS: readonly number[] = [2, 4, 8];
/** Fração de semínima da grade de arredondamento. */
const GRID = 24;
/** Canal 10 do General MIDI (9 contando do zero) é bateria. */
const DRUM_CHANNEL = 9;

interface Bar {
  start: number;
  length: number;
}

const fail = (message: string): never => {
  throw new RangeError(`MIDI: ${message}`);
};

function timeSignatureOf(raw: number[] | undefined): TimeSignature {
  const [beats, unit] = raw ?? [4, 4];
  if (!Number.isInteger(beats) || beats < 1 || !UNITS.includes(unit)) fail(`compasso ${beats}/${unit} não suportado`);
  return { beats, unit: unit as TimeSignature['unit'] };
}

/** Barras de compasso até `end` (em ticks), seguindo as mudanças de fórmula. */
function bars(midi: Midi, end: number): { bars: Bar[]; widest: number; first: TimeSignature } {
  const ppq = midi.header.ppq;
  const changes = [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks);
  const first = timeSignatureOf(changes[0]?.ticks === 0 ? changes[0].timeSignature : undefined);
  const found: Bar[] = [];
  let widest = first.beats;
  let at = 0;
  let i = 0;
  let current = first;
  while (at < end) {
    while (i < changes.length && changes[i].ticks <= at) current = timeSignatureOf(changes[i++].timeSignature);
    const full = Math.round((current.beats * 4 * ppq) / current.unit);
    const next = i < changes.length ? changes[i].ticks : Infinity;
    const length = Math.min(full, next - at);
    widest = Math.max(widest, Math.ceil(tidy(((length / ppq) * first.unit) / 4) - 1e-6));
    found.push({ start: at, length });
    at += length;
  }
  return { bars: found, widest, first };
}

function keyOf(midi: Midi): KeySignature {
  const k = midi.header.keySignatures.find((s) => s.ticks === 0) ?? midi.header.keySignatures[0];
  const fifths = k ? KEYS.indexOf(k.key) - 7 : NaN;
  if (!k || !(fifths >= -7)) return DEFAULT_KEY;
  return { fifths, mode: k.scale === 'minor' ? 'minor' : 'major' };
}

/** Melodia da trilha em ticks já arredondados: a nota mais aguda de cada ataque, cortada onde a próxima começa. */
function melody(track: Midi['tracks'][number], ppq: number): { start: number; end: number; midi: number }[] {
  const quantum = ppq / GRID;
  const q = (ticks: number) => Math.round(ticks / quantum) * quantum;
  const notes: { start: number; end: number; midi: number }[] = [];
  const sorted = [...track.notes].sort((a, b) => a.ticks - b.ticks || b.midi - a.midi);
  for (const n of sorted) {
    const start = q(n.ticks);
    const end = Math.max(q(n.ticks + n.durationTicks), start + quantum);
    const last = notes[notes.length - 1];
    if (last && last.start === start) continue;
    if (last && last.end > start) last.end = start;
    // respiro de até uma fusa entre notas (articulação de quem gravou) não vira pausa
    if (last && start - last.end <= ppq / 8) last.end = start;
    notes.push({ start, end, midi: n.midi });
  }
  return notes;
}

/** Cada trilha com notas (menos bateria) vira uma parte; nome da trilha, ou o do instrumento. */
export function parseMidiParts(bytes: Uint8Array, title: string): ScorePart[] {
  let midi: Midi;
  try {
    midi = new Midi(bytes);
  } catch (error) {
    return fail(`arquivo inválido (${error instanceof Error ? error.message : String(error)})`);
  }
  const ppq = midi.header.ppq;
  if (!(ppq > 0)) fail('divisão de tempo inválida');
  const tracks = midi.tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.notes.length > 0 && track.channel !== DRUM_CHANNEL && !track.instrument.percussion);
  if (!tracks.length) fail('nenhuma trilha com notas');

  const melodies = tracks.map(({ track }) => melody(track, ppq));
  const end = Math.max(...melodies.map((notes) => notes[notes.length - 1].end));
  const grid = bars(midi, end);
  const unit = grid.first.unit;
  const toBeats = (ticks: number) => tidy(((ticks / ppq) * unit) / 4);
  // o arquivo guarda microssegundos por semínima: 90 bpm volta como 89,99995
  const raw = [...midi.header.tempos].sort((a, b) => a.ticks - b.ticks)[0]?.bpm ?? DEFAULT_QUARTER_BPM;
  const tempo = Math.round(raw * 100) / 100;
  const key = keyOf(midi);
  const timeSignature: TimeSignature = { beats: grid.widest, unit };

  return tracks.map(({ track, index }, t) => {
    const measures: ScoreMeasure[] = grid.bars.map((bar) => ({ beats: toBeats(bar.length), notes: [] }));
    let b = 0;
    for (const note of melodies[t]) {
      let start = note.start;
      let tie = false;
      while (start < note.end) {
        while (grid.bars[b].start + grid.bars[b].length <= start) b++;
        const bar = grid.bars[b];
        const stop = Math.min(note.end, bar.start + bar.length);
        const out: ScoreNote = { beat: toBeats(start - bar.start), beats: toBeats(stop - start), midi: note.midi };
        if (tie) out.tie = true;
        measures[b].notes.push(out);
        tie = true;
        start = stop;
      }
    }
    // compassos vazios antes da 1ª nota e depois da última são de outras trilhas
    const first = measures.findIndex((m) => m.notes.length > 0);
    const last = measures.findLastIndex((m) => m.notes.length > 0);
    return {
      id: `t${index}`,
      name: track.name.trim() || track.instrument.name || `Trilha ${index + 1}`,
      instrument: track.instrument.number,
      score: {
        title,
        composer: '',
        key,
        bpm: tidy((tempo * unit) / 4),
        timeSignature,
        measures: measures.slice(first, last + 1),
      },
    };
  });
}
