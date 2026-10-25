import type { OrchestraSection } from '../../assets/styles/themes/types';
import type { Song } from '../notation/song';
import {
  DUCK_DB,
  DUCK_RAMP_SECONDS,
  duckWindows,
  scheduleOrchestra,
  type DuckWindow,
  type TimedNote,
} from './schedule';
import { VOICES, dbToGain, type Voice } from './voices';

export interface RenderOrchestraOptions {
  sampleRate: number;
  /** Tamanho da saída, em amostras. */
  length: number;
  /** Instante do primeiro tempo no sinal, em segundos. */
  startSeconds: number;
  bpm?: number;
  a4?: number;
  sections?: readonly OrchestraSection[];
  /** Volume geral linear. */
  volume?: number;
  headphones?: boolean;
  /** Queda nos ataques; padrão: sem fone. Desligada serve de referência do volume do alto-falante nos testes. */
  ducking?: boolean;
}

/**
 * A orquestra como o createOrchestra toca, renderizada fora do navegador para os testes: mesmas notas, vozes, envelopes
 * e queda em volta dos ataques (sem fone).
 */
export function renderOrchestra(song: Song, options: RenderOrchestraOptions): Float32Array {
  const { sampleRate, length, startSeconds, volume = 1, headphones = false, ducking = !headphones } = options;
  const out = new Float32Array(length);
  const notes = scheduleOrchestra(song, { ...options, startAt: startSeconds });
  for (const note of notes) addNote(out, sampleRate, note, VOICES[note.part], volume);
  if (ducking) applyDuck(out, sampleRate, duckWindows(song, startSeconds, options.bpm));
  return out;
}

export function duckGainAt(windows: readonly DuckWindow[], t: number): number {
  const low = dbToGain(DUCK_DB);
  for (const { from, to } of windows) {
    if (t < from - DUCK_RAMP_SECONDS) return 1;
    if (t <= to + DUCK_RAMP_SECONDS) {
      if (t < from) return 1 - ((1 - low) * (t - (from - DUCK_RAMP_SECONDS))) / DUCK_RAMP_SECONDS;
      if (t <= to) return low;
      return low + ((1 - low) * (t - to)) / DUCK_RAMP_SECONDS;
    }
  }
  return 1;
}

function applyDuck(out: Float32Array, sampleRate: number, windows: readonly DuckWindow[]): void {
  for (const { from, to } of windows) {
    const first = Math.max(0, Math.floor((from - DUCK_RAMP_SECONDS) * sampleRate));
    const last = Math.min(out.length, Math.ceil((to + DUCK_RAMP_SECONDS) * sampleRate));
    const local = [{ from, to }];
    for (let i = first; i < last; i++) out[i] *= duckGainAt(local, i / sampleRate);
  }
}

export function envelopeAt(voice: Voice, t: number, duration: number): number {
  const held = (s: number) => {
    if (s < voice.attack) return s / voice.attack;
    if (s < voice.attack + voice.decay) return 1 - ((1 - voice.sustain) * (s - voice.attack)) / voice.decay;
    return voice.sustain;
  };
  if (t < 0) return 0;
  if (t < duration) return held(t);
  return held(duration) * Math.max(0, 1 - (t - duration) / voice.release);
}

function addNote(out: Float32Array, sampleRate: number, note: TimedNote, voice: Voice, volume: number): void {
  const gain = dbToGain(voice.gainDb) * note.velocity * volume;
  const first = Math.max(0, Math.ceil(note.time * sampleRate));
  const last = Math.min(out.length, Math.ceil((note.time + note.duration + voice.release) * sampleRate));
  const membrane = voice.membrane;
  let phase = 0;
  for (let i = first; i < last; i++) {
    const t = i / sampleRate - note.time;
    out[i] += gain * envelopeAt(voice, t, note.duration) * Math.sin(phase);
    const frequency =
      membrane && t < membrane.pitchDecay
        ? note.frequency * membrane.octaves ** (1 - t / membrane.pitchDecay)
        : note.frequency;
    phase += (2 * Math.PI * frequency) / sampleRate;
  }
}
