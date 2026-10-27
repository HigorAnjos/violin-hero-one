import { secondsPerBeat, timeline, type Song } from '../game/notation/song';
import { midiToFrequency } from '../game/notation/violin';
import { loadOrchestraSettings } from '../game/synth';
import { loadA4 } from '../services/playerAudio';
import { loadOrchestra, type GameOrchestra, type OrchestraFactory } from './orchestra';

/** "Ouvir" do editor: a melodia escrita num sintetizador simples e a orquestra do jogo acompanhando. */

/** Folga entre o toque e o primeiro tempo: o agendador da orquestra precisa de LOOKAHEAD à frente. */
const LEAD_IN_SECONDS = 0.25;
const ATTACK_SECONDS = 0.02;
const RELEASE_SECONDS = 0.08;
const MELODY_GAIN = 0.18;

export interface PreviewNote {
  /** Hora do AudioContext do ataque. */
  time: number;
  duration: number;
  frequency: number;
}

/** A música a partir do compasso `measure` (o "ouvir daqui"): a ligadura que perdeu a nota de antes vira ataque. */
export function songFrom(song: Song, measure: number): Song {
  const from = Math.min(Math.max(0, measure), song.measures.length - 1);
  if (from === 0) return song;
  const measures = song.measures.slice(from).map((m, i) => (i === 0 ? { ...m, notes: m.notes.map((n) => (n.beat === 0 && n.tie ? { ...n, tie: undefined } : n)) } : m));
  return { ...song, measures };
}

/** Os ataques da melodia na hora do contexto; a nota ligada só estica a anterior. */
export function previewNotes(song: Song, startAt: number, a4: number): PreviewNote[] {
  const spb = secondsPerBeat(song);
  const out: PreviewNote[] = [];
  for (const note of timeline(song)) {
    const last = out[out.length - 1];
    if (note.tie && last) {
      last.duration += note.beats * spb;
      continue;
    }
    out.push({ time: startAt + note.at * spb, duration: note.beats * spb, frequency: midiToFrequency(note.midi, a4) });
  }
  return out;
}

export interface Listening {
  /** Resolve quando a música acaba ou quando `stop()` é chamado. */
  readonly done: Promise<void>;
  stop(): void;
}

export interface ListenOptions {
  /** Ouvir a partir deste compasso (a partir de 0). */
  fromMeasure?: number;
  createContext?: () => AudioContext;
  orchestra?: OrchestraFactory;
}

/** Uma nota do sintetizador da melodia: dente de serra filtrada, com ataque e soltura curtos (sem estalo). */
function playNote(context: AudioContext, destination: AudioNode, note: PreviewNote): OscillatorNode {
  const osc = context.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = note.frequency;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  const gain = context.createGain();
  const end = note.time + Math.max(note.duration, ATTACK_SECONDS * 2);
  gain.gain.setValueAtTime(0, note.time);
  gain.gain.linearRampToValueAtTime(MELODY_GAIN, note.time + ATTACK_SECONDS);
  gain.gain.setValueAtTime(MELODY_GAIN, end - RELEASE_SECONDS / 2);
  gain.gain.linearRampToValueAtTime(0, end + RELEASE_SECONDS / 2);
  osc.connect(filter).connect(gain).connect(destination);
  osc.start(note.time);
  osc.stop(end + RELEASE_SECONDS);
  return osc;
}

/**
 * Toca a música num AudioContext próprio (criado no toque, como o navegador pede) e o fecha no fim. A orquestra segue
 * as Configurações (ligada, volume); com fone ou sem, aqui ela toca completa porque ninguém está sendo ouvido.
 */
export async function listen(song: Song, { fromMeasure = 0, createContext = () => new AudioContext({ latencyHint: 'interactive' }), orchestra: factory = loadOrchestra }: ListenOptions = {}): Promise<Listening> {
  const part = songFrom(song, fromMeasure);
  const context = createContext();
  if (context.state === 'suspended') await context.resume().catch(() => undefined);
  const startAt = context.currentTime + LEAD_IN_SECONDS;
  const notes = previewNotes(part, startAt, loadA4());
  const voices = notes.map((note) => playNote(context, context.destination, note));
  const settings = loadOrchestraSettings();
  let band: GameOrchestra | null = null;
  try {
    band = await factory(context, part, { startAt, headphones: true, enabled: settings.enabled, volume: settings.volume });
  } catch {
    // Sem a orquestra (falhou ao carregar o tone): a melodia toca sozinha
  }
  const last = notes[notes.length - 1];
  const endsAt = last ? last.time + last.duration + RELEASE_SECONDS : startAt;
  let finish: () => void = () => undefined;
  const done = new Promise<void>((resolve) => (finish = resolve));
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    for (const v of voices) {
      try {
        v.stop();
      } catch {
        // já parou
      }
    }
    band?.dispose();
    void context.close().catch(() => undefined);
    finish();
  };
  const timer = setTimeout(stop, Math.max(0, (endsAt - context.currentTime) * 1000) + 200);
  return { done, stop };
}
