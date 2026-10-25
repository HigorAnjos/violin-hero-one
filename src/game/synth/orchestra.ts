import type { OrchestraSection } from '../../assets/styles/themes/types';
import { ENERGY_MAX, ENERGY_START } from '../engine/energy';
import type { Song } from '../notation/song';
import { PARTS, PART_SECTION, type Part } from './arrange';
import { scheduleOrchestra } from './schedule';
import { SECTION_ORDER, levelFor, sectionsFor, type OrchestraLevel } from './sections';
import { clampVolume, DEFAULT_ORCHESTRA_VOLUME } from './settings';
import { VOICES, type Voice } from './voices';

export const SECTION_FADE_IN_SECONDS = 0.4;
export const SECTION_FADE_OUT_SECONDS = 0.8;
export const VOLUME_RAMP_SECONDS = 0.05;
export const STOP_FADE_SECONDS = 0.3;

/**
 * −120 dBFS de DC, abaixo de um degrau de 16 bits: o Chrome marca a página como audível com qualquer saída não nula e
 * essa troca custa um quadro longo (33–50 ms com CPU 4×); assim ela acontece na contagem, não no primeiro tempo.
 */
export const KEEP_AUDIBLE_LEVEL = 1e-6;

export interface OrchestraOptions {
  /** Tempo do AudioContext do primeiro tempo da música: o mesmo startAt do Motor. */
  startAt: number;
  /** Andamento da partida; padrão: o da música. */
  bpm?: number;
  a4?: number;
  /** Energia inicial, 0 a 1; padrão: a de início do Motor. */
  energy?: number;
  /** Linear 0 a 1. */
  volume?: number;
  enabled?: boolean;
  /** Padrão: context.destination. */
  destination?: AudioNode;
}

export interface Orchestra {
  readonly startAt: number;
  readonly level: OrchestraLevel;
  readonly sections: readonly OrchestraSection[];
  /** Energia do Motor (state.energy, 0 a 1): os naipes entram e saem com rampa. */
  setEnergy(energy: number): void;
  setVolume(volume: number): void;
  /** Liga ou desliga a orquestra sem desagendar as notas. */
  setEnabled(enabled: boolean): void;
  /** Some em `fadeSeconds` e libera tudo (game over, sair da partida). Chamar de novo não faz nada. */
  stop(fadeSeconds?: number): Promise<void>;
  /** Libera na hora, sem rampa. */
  dispose(): void;
}

const QUIET_LOGGER = { log: () => undefined, warn: () => undefined };

/**
 * Agenda a orquestra inteira no AudioContext do jogo, de uma vez, em startAt + tempo × segundos por tempo, direto nos
 * AudioParams: o mesmo relógio da pista e do Motor, sem Transport e sem deriva; context.suspend() pausa junto.
 *
 * Imports profundos e sob demanda: o ponto de entrada do tone cria um Transport global (um segundo AudioContext e um
 * ticker em worker) só de importar. O Context do Tone embrulha o contexto do jogo com o relógio "offline" (sem ticker)
 * e nunca é descartado, porque Context.dispose() fecharia o AudioContext do jogo. Vozes monofônicas: o PolySynth
 * empurra ataques futuros para o ticker da thread principal.
 */
export async function createOrchestra(context: BaseAudioContext, song: Song, options: OrchestraOptions): Promise<Orchestra> {
  const [{ Context }, { setContext }, { Gain }, { Synth }, { MembraneSynth }, { setLogger }] = await Promise.all([
    import('tone/build/esm/core/context/Context.js'),
    import('tone/build/esm/core/Global.js'),
    import('tone/build/esm/core/context/Gain.js'),
    import('tone/build/esm/instrument/Synth.js'),
    import('tone/build/esm/instrument/MembraneSynth.js'),
    import('tone/build/esm/core/util/Debug.js'),
  ]);
  type ToneGain = InstanceType<typeof Gain>;
  type ToneVoice = InstanceType<typeof Synth> | InstanceType<typeof MembraneSynth>;

  const raw = context as AudioContext;
  const previousStateHandler = raw.onstatechange;
  const toneContext = new Context({ context: raw, clockSource: 'offline' });
  raw.onstatechange = previousStateHandler;
  // Todo getDefaults() chama getContext(), que cria um Context com worker num AudioContext novo se nenhum estiver definido.
  setContext(toneContext);

  const { startAt, destination = context.destination } = options;
  let level = levelFor(options.energy ?? ENERGY_START / ENERGY_MAX);

  const keepAudible = raw.createConstantSource();
  keepAudible.offset.value = KEEP_AUDIBLE_LEVEL;
  keepAudible.connect(destination);
  keepAudible.start();

  const mute = new Gain({ context: toneContext, gain: options.enabled === false ? 0 : 1 }).connect(destination);
  const master = new Gain({ context: toneContext, gain: clampVolume(options.volume ?? DEFAULT_ORCHESTRA_VOLUME) });
  master.connect(mute);
  const active = new Set(sectionsFor(level));
  const sectionGain = Object.fromEntries(
    SECTION_ORDER.map((section) => {
      const gain = new Gain({ context: toneContext, gain: active.has(section) ? 1 : 0 });
      gain.connect(master);
      return [section, gain];
    }),
  ) as Record<OrchestraSection, ToneGain>;

  const envelope = (voice: Voice) => ({
    attack: voice.attack,
    decay: voice.decay,
    sustain: voice.sustain,
    release: voice.release,
    attackCurve: 'linear' as const,
    decayCurve: 'linear' as const,
    releaseCurve: 'linear' as const,
  });
  const makeVoice = (part: Part): ToneVoice => {
    const voice = VOICES[part];
    const common = { context: toneContext, oscillator: { type: 'sine' as const }, envelope: envelope(voice), volume: voice.gainDb };
    const synth = voice.membrane
      ? new MembraneSynth({ ...common, octaves: voice.membrane.octaves, pitchDecay: voice.membrane.pitchDecay })
      : new Synth(common);
    return synth.connect(sectionGain[PART_SECTION[part]]);
  };
  const voices = Object.fromEntries(
    PARTS.map((part) => [part, Array.from({ length: VOICES[part].polyphony }, () => makeVoice(part))]),
  ) as Record<Part, ToneVoice[]>;

  const now = context.currentTime;
  const next: Record<Part, number> = { bass: 0, pad: 0, arpeggio: 0, brass: 0, timpani: 0 };
  // Agendar com o contexto suspenso avisa uma vez por nota; ele volta a rodar com o jogo.
  const suspended = raw.state !== 'running';
  if (suspended) setLogger(QUIET_LOGGER);
  try {
    for (const note of scheduleOrchestra(song, { startAt, bpm: options.bpm, a4: options.a4 })) {
      const pool = voices[note.part];
      const voice = pool[next[note.part]++ % pool.length];
      if (note.time + note.duration <= now) continue;
      voice.triggerAttackRelease(note.frequency, note.duration, Math.max(note.time, now), note.velocity);
    }
  } finally {
    if (suspended) setLogger(console);
  }

  let disposed = false;
  let stopping: Promise<void> | undefined;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    keepAudible.stop();
    keepAudible.disconnect();
    for (const pool of Object.values(voices)) for (const voice of pool) voice.dispose();
    for (const gain of Object.values(sectionGain)) gain.dispose();
    master.dispose();
    mute.dispose();
  };

  return {
    startAt,
    get level() {
      return level;
    },
    get sections() {
      return sectionsFor(level);
    },
    setEnergy(energy) {
      if (disposed || stopping) return;
      const nextLevel = levelFor(energy, level);
      if (nextLevel === level) return;
      const on = new Set(sectionsFor(nextLevel));
      for (const section of SECTION_ORDER) {
        const was = active.has(section);
        const is = on.has(section);
        if (was === is) continue;
        sectionGain[section].gain.rampTo(is ? 1 : 0, is ? SECTION_FADE_IN_SECONDS : SECTION_FADE_OUT_SECONDS);
        if (is) active.add(section);
        else active.delete(section);
      }
      level = nextLevel;
    },
    setVolume(volume) {
      if (!disposed && !stopping) master.gain.rampTo(clampVolume(volume), VOLUME_RAMP_SECONDS);
    },
    setEnabled(enabled) {
      if (!disposed && !stopping) mute.gain.rampTo(enabled ? 1 : 0, VOLUME_RAMP_SECONDS);
    },
    stop(fadeSeconds = STOP_FADE_SECONDS) {
      if (disposed) return Promise.resolve();
      if (!stopping) {
        mute.gain.rampTo(0, fadeSeconds);
        stopping = new Promise((resolve) => {
          setTimeout(() => {
            dispose();
            resolve();
          }, fadeSeconds * 1000);
        });
      }
      return stopping;
    },
    dispose,
  };
}
