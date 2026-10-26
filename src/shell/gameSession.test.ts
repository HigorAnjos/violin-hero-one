import { describe, it, expect, vi } from 'vitest';
import { ODE, reading } from '../game/engine/testing';
import type { EarAudio } from './Ear';
import { countInTimes, createGameSession, LEAD_SECONDS, type GameSessionOptions, type SessionEvent } from './gameSession';
import type { GameOrchestra } from './orchestra';

function fakeAudio(start = 10) {
  const context = {
    currentTime: start,
    state: 'running',
    suspend: vi.fn(async function (this: { state: string }) {
      context.state = 'suspended';
    }),
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
  };
  return { audio: { context, source: {}, stream: null } as unknown as EarAudio, context };
}

function orchestraSpy() {
  const made: { startAt: number; orchestra: GameOrchestra }[] = [];
  const factory = vi.fn(async (_c: BaseAudioContext, _s: unknown, o: { startAt: number }) => {
    const orchestra = { update: vi.fn(), setVolume: vi.fn(), soundingAt: vi.fn(() => [] as number[]), stop: vi.fn().mockResolvedValue(undefined), dispose: vi.fn() };
    made.push({ startAt: o.startAt, orchestra });
    return orchestra;
  });
  return { factory, made };
}

const base = (audio: EarAudio, extra: Partial<GameSessionOptions> = {}): GameSessionOptions => ({
  song: ODE,
  audio,
  a4: 442,
  latencySeconds: 0.1,
  clicks: () => () => undefined,
  ...extra,
});

describe('countInTimes', () => {
  it('um compasso antes do início, só os tempos que ainda vêm', () => {
    // Ode: 100 bpm, 4 tempos → 0,6 s por tempo
    expect(countInTimes(ODE, 12, 0)).toEqual([9.6, 10.2, 10.8, 11.4].map((t) => expect.closeTo(t, 6)));
    expect(countInTimes(ODE, 12, 10.5)).toHaveLength(2);
  });
});

describe('createGameSession', () => {
  it('começa depois da pista encher, e toca o compasso de entrada que cabe', () => {
    const { audio } = fakeAudio(10);
    const clicks = vi.fn(() => () => undefined);
    const session = createGameSession(base(audio, { clicks }));
    expect(session.startAt).toBe(10 + LEAD_SECONDS);
    expect(clicks).toHaveBeenCalledWith(audio.context, countInTimes(ODE, 12, 10.05));
  });

  it('o nível dá a descida da pista e as folgas do motor', () => {
    const firstJudgment = (extra: Partial<GameSessionOptions>) => {
      const { audio } = fakeAudio(10);
      const events: SessionEvent[] = [];
      const session = createGameSession(base(audio, { ...extra, onEvent: (e) => events.push(e) }));
      const first = session.engine.notes[0];
      // 40 ¢ alto: Bom com a folga de sempre (Ótimo até 35 ¢), Ótimo com a do "nunca toquei" (até 42 ¢)
      for (let i = 0; i < 6; i++) session.push(reading(first.time + 0.1 + i * 0.02, first.midi, 40));
      session.engine.advance(first.time + 1);
      return { startAt: session.startAt, judgment: events.find((e) => e.type === 'judgment') };
    };
    const loose = firstJudgment({ leadSeconds: 3, toleranceCents: 60, windows: { perfect: 100, great: 170, good: 280 } });
    expect(loose.startAt).toBe(13);
    expect(loose.judgment).toMatchObject({ judgment: 'great' });
    expect(firstJudgment({})).toMatchObject({ startAt: 10 + LEAD_SECONDS, judgment: { judgment: 'good' } });
  });

  it('?simular: o violinista sintético toca a música inteira no relógio do jogo', () => {
    const { audio, context } = fakeAudio(0);
    const events: SessionEvent[] = [];
    const track = { update: vi.fn(), onJudgment: vi.fn() };
    const session = createGameSession(base(audio, { performance: { offsetMs: 0 }, onEvent: (e) => events.push(e) }));
    session.setTrack(track);
    while (session.engine.status === 'playing' && context.currentTime < 30) {
      context.currentTime += 1 / 60;
      session.frame();
    }
    const done = events.find((e) => e.type === 'done');
    expect(done && done.type === 'done' && done.result.counts.miss).toBe(0);
    expect(track.onJudgment).toHaveBeenCalledTimes(session.engine.notes.length);
    expect(track.update).toHaveBeenLastCalledWith(context.currentTime);
  });

  it('no modo simulado ignora o microfone', () => {
    const { audio } = fakeAudio(0);
    const session = createGameSession(base(audio, { performance: { offsetMs: 0 } }));
    const push = vi.spyOn(session.engine, 'push');
    session.push(reading(1, 78));
    expect(push).not.toHaveBeenCalled();
  });

  it('a orquestra começa no startAt do contexto e segue cada julgamento', async () => {
    const { audio, context } = fakeAudio(0);
    const { factory, made } = orchestraSpy();
    const session = createGameSession(base(audio, { performance: { offsetMs: 0 }, orchestra: factory }));
    await vi.waitFor(() => expect(made).toHaveLength(1));
    expect(made[0].startAt).toBe(session.startAt);
    while (session.engine.status === 'playing' && context.currentTime < 30) {
      context.currentTime += 1 / 60;
      session.frame();
    }
    expect(made[0].orchestra.update).toHaveBeenCalledWith(expect.objectContaining({ energy: expect.any(Number), combo: expect.any(Number) }));
    expect(made[0].orchestra.stop).toHaveBeenCalled();
  });

  it('pausa congela a hora de jogo e continua de onde parou', async () => {
    const { audio, context } = fakeAudio(5);
    const session = createGameSession(base(audio));
    await session.pause();
    context.currentTime = 5.3;
    expect(session.now()).toBe(5);
    expect(context.suspend).toHaveBeenCalled();
    await session.resume();
    context.currentTime = 5.4;
    expect(session.now()).toBeCloseTo(5.1, 6);
  });

  it('reabertura num contexto novo: hora de jogo contínua, leituras e orquestra reancoradas', async () => {
    const first = fakeAudio(20);
    const { factory, made } = orchestraSpy();
    const session = createGameSession(base(first.audio, { orchestra: factory }));
    await vi.waitFor(() => expect(made).toHaveLength(1));
    first.context.currentTime = 21;
    await session.pause();

    const second = fakeAudio(0.2);
    await session.reanchor(second.audio);
    expect(second.context.suspend).toHaveBeenCalled();
    second.context.currentTime = 0.2;
    expect(session.now()).toBeCloseTo(21, 6);
    expect(made[0].orchestra.dispose).toHaveBeenCalled();
    expect(made).toHaveLength(1);
    await session.resume();
    await vi.waitFor(() => expect(made).toHaveLength(2));
    expect(made[1].startAt).toBeCloseTo(session.startAt - 20.8, 6);
    expect(session.contextNotes()[0].time).toBeCloseTo(session.engine.notes[0].time - 20.8, 6);

    const push = vi.spyOn(session.engine, 'push');
    session.push(reading(0.5, 78));
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ time: expect.closeTo(21.3, 6) }));
  });

  it('o motor pergunta à orquestra o que soa, no relógio do contexto atual', async () => {
    const first = fakeAudio(20);
    const { factory, made } = orchestraSpy();
    const session = createGameSession(base(first.audio, { orchestra: factory }));
    await vi.waitFor(() => expect(made).toHaveLength(1));
    first.context.currentTime = 21;
    await session.pause();
    const second = fakeAudio(0.2);
    await session.reanchor(second.audio);
    await session.resume();
    await vi.waitFor(() => expect(made).toHaveLength(2));
    session.push(reading(0.5, 78));
    expect(made[1].orchestra.soundingAt).toHaveBeenCalledWith(expect.closeTo(0.5 - 0.1 - 0.03, 2));
  });

  it('com fone não pergunta: a orquestra não vaza', async () => {
    const { audio } = fakeAudio(0);
    const { factory, made } = orchestraSpy();
    const session = createGameSession(base(audio, { orchestra: factory, orchestraPrefs: { enabled: true, volume: 0.5, headphones: true } }));
    await vi.waitFor(() => expect(made).toHaveLength(1));
    session.push(reading(0.5, 78));
    expect(made[0].orchestra.soundingAt).not.toHaveBeenCalled();
  });

  it('o volume da orquestra vale agora e na orquestra recriada', async () => {
    const first = fakeAudio(0);
    const { factory, made } = orchestraSpy();
    const session = createGameSession(base(first.audio, { orchestra: factory }));
    await vi.waitFor(() => expect(made).toHaveLength(1));
    session.setOrchestraVolume(0.2);
    expect(made[0].orchestra.setVolume).toHaveBeenCalledWith(0.2);
    await session.reanchor(fakeAudio(0).audio);
    await session.resume();
    await vi.waitFor(() => expect(factory).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ volume: 0.2 })));
  });

  it('destroy cala o compasso de entrada e libera a orquestra', async () => {
    const { audio } = fakeAudio(0);
    const silence = vi.fn();
    const { factory, made } = orchestraSpy();
    const session = createGameSession(base(audio, { clicks: () => silence, orchestra: factory }));
    await vi.waitFor(() => expect(made).toHaveLength(1));
    session.destroy();
    expect(silence).toHaveBeenCalled();
    expect(made[0].orchestra.dispose).toHaveBeenCalled();
  });
});
