/** Violino, sala e TV sintéticos em áudio de verdade, para o microfone falso do e2e. Só os testes importam daqui. */
import { secondsPerBeat, timeline, type Song } from '../../notation/song';
import { DEFAULT_A4, OPEN_STRING_MIDI, midiToFrequency } from '../../notation/violin';
import { DEFAULT_SAMPLE_RATE, VIOLIN_HARMONICS, mulberry32 } from './synth';

/** Arco destacado: silêncio entre notas maior que o buraco que o Motor exige para ver ataque novo na mesma nota. */
export const NOTE_GAP_SECONDS = 0.1;
export const ATTACK_SECONDS = 0.03;
export const RELEASE_SECONDS = 0.03;
export const VIBRATO_RATE_HZ = 5.5;
/** Chiado de sala (~−60 dBFS): nenhum microfone de verdade entrega zero digital. */
export const ROOM_NOISE = 0.001;
const NOTE_PEAK = 0.5;

/** Como uma nota sai diferente da partitura. */
export interface NoteSlip {
  offsetMs?: number;
  cents?: number;
  semitones?: number;
}

export interface SongAudioOptions {
  a4?: number;
  sampleRate?: number;
  /** Segundos antes do primeiro tempo da música. */
  leadInSeconds?: number;
  tailSeconds?: number;
  vibratoCents?: number;
  /** Por índice de ataque (o `index` do EngineNote). */
  slips?: Readonly<Record<number, NoteSlip>>;
  seed?: number;
}

export interface SoundedNote {
  attack: number;
  start: number;
  end: number;
  hz: number;
}

/** Os ataques da música em segundos desde o primeiro tempo, com as ligaduras somadas e os deslizes aplicados. */
export function soundedNotes(song: Song, options: Pick<SongAudioOptions, 'a4' | 'slips'> = {}): SoundedNote[] {
  const a4 = options.a4 ?? DEFAULT_A4;
  const spb = secondsPerBeat(song);
  const plan: { at: number; end: number; midi: number }[] = [];
  for (const n of timeline(song)) {
    const previous = plan[plan.length - 1];
    if (n.tie && previous) previous.end += n.beats * spb;
    else plan.push({ at: n.at * spb, end: (n.at + n.beats) * spb, midi: n.midi });
  }
  return plan.map((n, attack) => {
    const slip = options.slips?.[attack] ?? {};
    const next = plan[attack + 1];
    const start = n.at + (slip.offsetMs ?? 0) / 1000;
    const end = Math.min(n.end, next ? next.at : Infinity) - NOTE_GAP_SECONDS;
    const hz = midiToFrequency(n.midi + (slip.semitones ?? 0), a4) * 2 ** ((slip.cents ?? 0) / 1200);
    return { attack, start, end: Math.max(end, start + ATTACK_SECONDS + RELEASE_SECONDS), hz };
  });
}

/** A música inteira tocada com arco destacado, no tempo exato salvo os deslizes. */
export function renderSong(song: Song, options: SongAudioOptions = {}): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const lead = options.leadInSeconds ?? 2;
  const notes = soundedNotes(song, options);
  const last = Math.max(...notes.map((n) => n.end));
  const out = roomNoise(lead + last + (options.tailSeconds ?? 2), sampleRate, options.seed);
  for (const n of notes) addNote(out, sampleRate, { ...n, start: lead + n.start, end: lead + n.end }, options.vibratoCents ?? 0);
  return out;
}

/** Sol, Ré, Lá e Mi soltas, cada uma `holdSeconds`, com uma pausa entre elas. */
export function renderOpenStrings(options: { a4?: number; sampleRate?: number; holdSeconds?: number; gapSeconds?: number } = {}): Float32Array {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const hold = options.holdSeconds ?? 2.5;
  const gap = options.gapSeconds ?? 0.4;
  const out = roomNoise(OPEN_STRING_MIDI.length * (hold + gap), sampleRate);
  OPEN_STRING_MIDI.forEach((midi, i) => {
    const start = gap / 2 + i * (hold + gap);
    addNote(out, sampleRate, { attack: i, start, end: start + hold, hz: midiToFrequency(midi, options.a4 ?? DEFAULT_A4) }, 0);
  });
  return out;
}

export function renderSilence(seconds: number, sampleRate = DEFAULT_SAMPLE_RATE): Float32Array {
  return roomNoise(seconds, sampleRate);
}

/**
 * TV ligada: voz falando (fundamental que desliza entre 110 e 260 Hz, sílabas de ~4 por segundo, harmônicos ricos)
 * sobre um chiado grave. A altura nunca para numa nota: nada ali deveria passar por corda solta tocada.
 */
export function renderTv(seconds = 10, sampleRate = DEFAULT_SAMPLE_RATE, seed = 7): Float32Array {
  const random = mulberry32(seed);
  const length = Math.round(seconds * sampleRate);
  const out = new Float32Array(length);
  let phase = 0;
  let low = 0;
  let glide = 0;
  let syllable = 0;
  let syllableLength = 0.25;
  let syllableGain = 0;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    if (t >= syllable + syllableLength) {
      syllable = t;
      syllableLength = 0.15 + random() * 0.2;
      syllableGain = random() < 0.2 ? 0 : 0.5 + random() * 0.5;
    }
    glide += (2 * Math.PI * (0.7 + 0.3 * Math.sin(t / 3))) / sampleRate;
    const f0 = 185 + 75 * Math.sin(glide) + 20 * Math.sin(2 * Math.PI * 2.3 * t);
    phase += (2 * Math.PI * f0) / sampleRate;
    const s = (t - syllable) / syllableLength;
    const envelope = syllableGain * Math.sin(Math.PI * Math.min(1, s)) ** 2;
    let voice = 0;
    for (let k = 1; k <= 12; k++) {
      const formant = 1 + 2 * Math.exp(-(((k * f0 - 700) / 300) ** 2)) + Math.exp(-(((k * f0 - 1200) / 400) ** 2));
      voice += (formant / k) * Math.sin(k * phase);
    }
    low += 0.05 * (random() * 2 - 1 - low);
    out[i] = 0.08 * envelope * voice + 0.15 * low;
  }
  return out;
}

function roomNoise(seconds: number, sampleRate: number, seed = 1): Float32Array {
  const random = mulberry32(seed);
  const out = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < out.length; i++) out[i] = ROOM_NOISE * (random() * 2 - 1);
  return out;
}

function addNote(out: Float32Array, sampleRate: number, note: SoundedNote, vibratoCents: number): void {
  const from = Math.max(0, Math.round(note.start * sampleRate));
  const to = Math.min(out.length, Math.round(note.end * sampleRate));
  const gain = NOTE_PEAK / VIOLIN_HARMONICS.reduce((a, b) => a + b, 0);
  const nyquist = sampleRate / 2;
  let phase = 0;
  for (let i = from; i < to; i++) {
    const t = (i - from) / sampleRate;
    const left = (to - i) / sampleRate;
    const envelope = Math.min(1, t / ATTACK_SECONDS, left / RELEASE_SECONDS);
    const f = note.hz * 2 ** ((vibratoCents * Math.sin(2 * Math.PI * VIBRATO_RATE_HZ * t)) / 1200);
    let sample = 0;
    for (let k = 0; k < VIOLIN_HARMONICS.length && (k + 1) * f < nyquist; k++) sample += VIOLIN_HARMONICS[k] * Math.sin((k + 1) * phase);
    out[i] += gain * envelope * sample;
    phase += (2 * Math.PI * f) / sampleRate;
  }
}
