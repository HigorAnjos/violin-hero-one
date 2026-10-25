import type { OrchestraSection } from '../../assets/styles/themes/types';
import type { Song } from '../notation/song';
import { scheduleOrchestra, type TimedNote } from './schedule';
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
}

/** A orquestra como o createOrchestra toca, renderizada fora do navegador para os testes: mesmas notas, vozes e envelopes. */
export function renderOrchestra(song: Song, options: RenderOrchestraOptions): Float32Array {
  const { sampleRate, length, startSeconds, volume = 1 } = options;
  const out = new Float32Array(length);
  const notes = scheduleOrchestra(song, { ...options, startAt: startSeconds });
  for (const note of notes) addNote(out, sampleRate, note, VOICES[note.part], volume);
  return out;
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
