import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleNotes } from '../engine/engine';
import { parseSong, type Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { KEEP_AUDIBLE_LEVEL, SECTION_FADE_IN_SECONDS, SECTION_FADE_OUT_SECONDS, STOP_FADE_SECONDS, createOrchestra } from './orchestra';
import { scheduleOrchestra } from './schedule';
import { VOICES } from './voices';

const tone = vi.hoisted(() => {
  class FakeParam {
    ramps: [number, number][] = [];
    constructor(public value: number) {}
    rampTo(value: number, seconds: number) {
      this.ramps.push([value, seconds]);
      this.value = value;
    }
  }
  const created: FakeNode[] = [];
  class FakeNode {
    disposed = false;
    connectedTo: unknown;
    constructor(public options: Record<string, unknown>) {
      created.push(this);
    }
    connect(destination: unknown) {
      this.connectedTo = destination;
      return this;
    }
    dispose() {
      this.disposed = true;
    }
  }
  const contexts: { options: { context: { onstatechange: unknown }; clockSource: string } }[] = [];
  class Context {
    constructor(public options: { context: { onstatechange: unknown }; clockSource: string }) {
      options.context.onstatechange = 'tone handler';
      contexts.push(this);
    }
  }
  class Gain extends FakeNode {
    gain: FakeParam;
    constructor(options: { gain: number }) {
      super(options);
      this.gain = new FakeParam(options.gain);
    }
  }
  const debug = { logger: console as unknown, quietAtTrigger: [] as boolean[] };
  class Synth extends FakeNode {
    triggers: [number, number, number, number][] = [];
    triggerAttackRelease(frequency: number, duration: number, time: number, velocity: number) {
      this.triggers.push([frequency, duration, time, velocity]);
      debug.quietAtTrigger.push(debug.logger !== console);
    }
  }
  class MembraneSynth extends Synth {}
  const setLogger = vi.fn((logger: unknown) => {
    debug.logger = logger;
  });
  return { created, contexts, Context, Gain, Synth, MembraneSynth, setContext: vi.fn(), setLogger, debug };
});

vi.mock('tone/build/esm/core/context/Context.js', () => ({ Context: tone.Context }));
vi.mock('tone/build/esm/core/Global.js', () => ({ setContext: tone.setContext }));
vi.mock('tone/build/esm/core/context/Gain.js', () => ({ Gain: tone.Gain }));
vi.mock('tone/build/esm/instrument/Synth.js', () => ({ Synth: tone.Synth }));
vi.mock('tone/build/esm/instrument/MembraneSynth.js', () => ({ MembraneSynth: tone.MembraneSynth }));
vi.mock('tone/build/esm/core/util/Debug.js', () => ({ setLogger: tone.setLogger }));
vi.mock('tone', () => {
  throw new Error('o ponto de entrada do tone cria um Transport global e um segundo AudioContext');
});

type FakeGain = InstanceType<typeof tone.Gain>;
type FakeSynth = InstanceType<typeof tone.Synth>;

const song = findFixedSong('brilha-brilha-estrelinha')!.song;

function fakeContext(currentTime = 0, state: AudioContextState = 'running') {
  const constant = {
    offset: { value: 1 },
    connectedTo: undefined as unknown,
    started: false,
    stopped: false,
    connect(destination: unknown) {
      this.connectedTo = destination;
    },
    disconnect() {
      this.connectedTo = undefined;
    },
    start() {
      this.started = true;
    },
    stop() {
      this.stopped = true;
    },
  };
  const handler = () => undefined;
  return {
    currentTime,
    state,
    destination: { name: 'destination' },
    onstatechange: handler,
    handler,
    constant,
    createConstantSource: () => constant,
  };
}

async function start(options: { song?: Song; now?: number; state?: AudioContextState; energy?: number; volume?: number; enabled?: boolean; bpm?: number } = {}) {
  const ctx = fakeContext(options.now, options.state);
  const orchestra = await createOrchestra(ctx as unknown as AudioContext, options.song ?? song, { startAt: 10, a4: 442, ...options });
  const gains = tone.created.filter((n) => n instanceof tone.Gain) as FakeGain[];
  const [mute, master, strings, woodwinds, brass, percussion] = gains;
  const synths = tone.created.filter((n) => n instanceof tone.Synth) as FakeSynth[];
  return { ctx, orchestra, mute, master, sections: { strings, woodwinds, brass, percussion }, synths };
}

beforeEach(() => {
  tone.created.length = 0;
  tone.contexts.length = 0;
  tone.setContext.mockClear();
  tone.setLogger.mockClear();
  tone.debug.logger = console;
  tone.debug.quietAtTrigger.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createOrchestra', () => {
  it('embrulha o contexto do jogo num Context do Tone sem ticker, sem trocar o onstatechange, e o define como global', async () => {
    const { ctx } = await start();
    expect(tone.contexts).toHaveLength(1);
    expect(tone.contexts[0].options).toMatchObject({ context: ctx, clockSource: 'offline' });
    expect(ctx.onstatechange).toBe(ctx.handler);
    expect(tone.setContext).toHaveBeenCalledWith(tone.contexts[0]);
    for (const node of tone.created) expect(node.options.context).toBe(tone.contexts[0]);
  });

  it('naipes → geral → liga/desliga → saída, e o DC inaudível que liga o áudio na contagem', async () => {
    const { ctx, mute, master, sections } = await start({ volume: 0.7 });
    expect(mute.connectedTo).toBe(ctx.destination);
    expect(master.connectedTo).toBe(mute);
    expect(master.gain.value).toBe(0.7);
    for (const gain of Object.values(sections)) expect(gain.connectedTo).toBe(master);
    expect(ctx.constant).toMatchObject({ started: true, connectedTo: ctx.destination });
    expect(ctx.constant.offset.value).toBe(KEEP_AUDIBLE_LEVEL);
  });

  it('cada voz vai para o gain do seu naipe, senoide com o volume e o envelope linear da voz', async () => {
    const { synths, sections } = await start();
    const [bass, pad0, , , arpeggio, brass0, , timpani] = synths;
    expect(synths).toHaveLength(8);
    expect(bass.connectedTo).toBe(sections.strings);
    expect(pad0.connectedTo).toBe(sections.strings);
    expect(arpeggio.connectedTo).toBe(sections.woodwinds);
    expect(brass0.connectedTo).toBe(sections.brass);
    expect(timpani).toBeInstanceOf(tone.MembraneSynth);
    expect(timpani.connectedTo).toBe(sections.percussion);
    expect(timpani.options).toMatchObject({ octaves: VOICES.timpani.membrane!.octaves, pitchDecay: VOICES.timpani.membrane!.pitchDecay });
    expect(bass.options).toMatchObject({
      oscillator: { type: 'sine' },
      volume: VOICES.bass.gainDb,
      envelope: { attack: VOICES.bass.attack, attackCurve: 'linear', decayCurve: 'linear', releaseCurve: 'linear' },
    });
  });

  it('relógio simulado: agenda todas as notas de uma vez, nos mesmos instantes da agenda pura, com velocidade', async () => {
    const { synths } = await start();
    const triggers = synths.flatMap((s) => s.triggers).sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    const expected = scheduleOrchestra(song, { startAt: 10, a4: 442 })
      .map((n) => [n.frequency, n.duration, n.time, n.velocity])
      .sort((a, b) => a[2] - b[2] || a[0] - b[0]);
    expect(triggers).toEqual(expected);
  });

  it('sem deriva numa música de 3 min: o baixo de cada acorde cai no instante exato do ataque que o Motor julga', async () => {
    const ode = findFixedSong('ode-a-alegria')!.song;
    const measures = Array.from({ length: 5 }, () => ode.measures).flat();
    const long = parseSong({ ...ode, id: 'ode-longa', measures });
    const { synths } = await start({ song: long, bpm: 92 });
    const engine = scheduleNotes(long, 10, 92);
    const bassTimes = synths[0].triggers.map((t) => t[2]);
    expect(bassTimes.at(-1)! - 10).toBeGreaterThan(180);
    for (const time of bassTimes) expect(engine.some((note) => note.time === time)).toBe(true);
  });

  it('entrando atrasado: pula o que já acabou e começa agora o que ainda soa', async () => {
    const now = 10 + 3 * (60 / song.bpm);
    const { synths } = await start({ now });
    const bass = synths[0].triggers;
    expect(bass[0][2]).toBe(now);
    expect(Math.min(...synths.flatMap((s) => s.triggers.map((t) => t[2])))).toBe(now);
  });

  it('contexto suspenso: cala os avisos do Tone só durante o agendamento', async () => {
    await start({ state: 'suspended' });
    expect(tone.debug.quietAtTrigger.every(Boolean)).toBe(true);
    expect(tone.setLogger).toHaveBeenLastCalledWith(console);
    tone.setLogger.mockClear();
    await start();
    expect(tone.setLogger).not.toHaveBeenCalled();
  });

  it('energia inicial padrão (0,6): cordas, madeiras e metais; a percussão espera a energia subir', async () => {
    const { orchestra, sections } = await start();
    expect(orchestra.level).toBe(3);
    expect(orchestra.sections).toEqual(['strings', 'woodwinds', 'brass']);
    expect([sections.strings, sections.woodwinds, sections.brass, sections.percussion].map((g) => g.gain.value)).toEqual([1, 1, 1, 0]);
  });

  it('update: naipes entram e saem com rampa, a percussão pelo combo, e repetir o nível não mexe em nada', async () => {
    const { orchestra, sections } = await start();
    orchestra.update({ energy: 0.9, combo: 11 });
    expect(sections.percussion.gain.ramps).toEqual([]);
    orchestra.update({ energy: 0.9, combo: 12 });
    expect(sections.percussion.gain.ramps).toEqual([[1, SECTION_FADE_IN_SECONDS]]);
    orchestra.update({ energy: 0.95, combo: 13 });
    expect(sections.percussion.gain.ramps).toHaveLength(1);
    orchestra.update({ energy: 0.2, combo: 0 });
    expect(orchestra.sections).toEqual(['strings']);
    for (const g of [sections.woodwinds, sections.brass, sections.percussion]) expect(g.gain.ramps.at(-1)).toEqual([0, SECTION_FADE_OUT_SECONDS]);
    expect(sections.strings.gain.ramps).toEqual([]);
    orchestra.update({ energy: 0, combo: 0 });
    expect(orchestra.level).toBe(0);
    expect(sections.strings.gain.ramps).toEqual([[0, SECTION_FADE_OUT_SECONDS]]);
  });

  it('volume e liga/desliga com rampa curta; começa desligada se pedido', async () => {
    const { orchestra, master, mute } = await start({ enabled: false });
    expect(mute.gain.value).toBe(0);
    orchestra.setVolume(2);
    expect(master.gain.value).toBe(1);
    orchestra.setEnabled(true);
    expect(mute.gain.value).toBe(1);
  });

  it('stop (game over): some em rampa, libera tudo depois e só uma vez', async () => {
    vi.useFakeTimers();
    const { orchestra, mute, ctx } = await start();
    const stopped = orchestra.stop();
    expect(orchestra.stop()).toBe(stopped);
    expect(mute.gain.ramps).toEqual([[0, STOP_FADE_SECONDS]]);
    orchestra.update({ energy: 1, combo: 20 });
    expect(orchestra.level).toBe(3);
    expect(tone.created.some((n) => n.disposed)).toBe(false);
    await vi.advanceTimersByTimeAsync(STOP_FADE_SECONDS * 1000);
    await stopped;
    expect(tone.created.every((n) => n.disposed)).toBe(true);
    expect(ctx.constant).toMatchObject({ stopped: true, connectedTo: undefined });
    await expect(orchestra.stop()).resolves.toBeUndefined();
  });

  it('dispose libera na hora, uma vez só', async () => {
    const { orchestra, ctx } = await start();
    orchestra.dispose();
    orchestra.dispose();
    expect(tone.created.every((n) => n.disposed)).toBe(true);
    expect(ctx.constant.stopped).toBe(true);
  });
});
