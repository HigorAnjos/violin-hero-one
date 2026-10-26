import { describe, expect, it, vi } from 'vitest';
import type { EngineState, PracticeResult } from '../game/engine';
import { scaleSong } from '../game/engine/testing';
import { songDurationSeconds } from '../game/notation/song';
import type { EarAudio } from './Ear';
import { beatTimes, createGameSession, mergeStates, TEMPO_CHANGE_MARGIN_SECONDS, type ClickScheduler, type GameSessionOptions, type SessionEvent } from './gameSession';

const SONG = scaleSong(3);
const SPB = 60 / SONG.bpm;

function rig(extra: Partial<GameSessionOptions> = {}) {
  const gains: { gain: { value: number }; connect: () => void; disconnect: () => void }[] = [];
  const context = {
    currentTime: 10,
    state: 'running',
    destination: {},
    suspend: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    createGain: vi.fn(() => {
      const g = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(g);
      return g;
    }),
  };
  const audio = { context, source: {}, stream: null } as unknown as EarAudio;
  const events: SessionEvent[] = [];
  const clicks = vi.fn<ClickScheduler>(() => () => undefined);
  const session = createGameSession({ song: SONG, audio, a4: 442, latencySeconds: 0, clicks, performance: { errors: 0 }, onEvent: (e) => events.push(e), ...extra });
  const run = (until: number) => {
    while (context.currentTime < until) {
      context.currentTime += 1 / 60;
      session.frame();
    }
  };
  return { session, context, events, clicks, gains, run };
}

describe('beatTimes', () => {
  it('os tempos inteiros na janela, atravessando trocas de andamento', () => {
    const segments = [
      { time: 10, beat: 0, spb: 0.5, endTime: 11, endBeat: 2 },
      { time: 11, beat: 2, spb: 1, endTime: Infinity, endBeat: Infinity },
    ];
    expect(beatTimes(segments, 10, 13.5)).toEqual([10, 10.5, 11, 12, 13]);
    expect(beatTimes(segments, 10.2, 11)).toEqual([10.5]);
  });

  it('no salto do laço, o tempo de A volta a soar', () => {
    const segments = [
      { time: 0, beat: 0, spb: 1, endTime: 4, endBeat: 4 },
      { time: 4, beat: 0, spb: 1, endTime: 8, endBeat: 4 },
    ];
    expect(beatTimes(segments, 3, 5.5)).toEqual([3, 4, 5]);
  });
});

describe('mergeStates', () => {
  const s = (over: Partial<EngineState>): EngineState => ({ score: 0, combo: 0, maxCombo: 0, multiplier: 1, energy: 0.5, accuracy: 0, judged: 0, total: 0, ...over });

  it('pontos somados, precisão ponderada, combo da parte que está tocando', () => {
    const merged = mergeStates(s({ score: 1000, combo: 12, maxCombo: 12, accuracy: 100, judged: 12, total: 20 }), s({ score: 300, combo: 3, maxCombo: 3, accuracy: 50, judged: 4, total: 16 }));
    expect(merged).toMatchObject({ score: 1300, combo: 3, maxCombo: 12, accuracy: 87.5, judged: 16, total: 36 });
  });

  it('antes da prática julgar, o combo segue o da parte comum', () => {
    expect(mergeStates(s({ combo: 7, judged: 7 }), s({ combo: 0 })).combo).toBe(7);
  });
});

describe('toPractice', () => {
  it('vira prática no próximo compasso, sem refazer o que foi tocado; o fim tem as voltas e nenhum selo', () => {
    const { session, events, run } = rig();
    run(session.startAt + 2.1 * SPB * 4);
    const judgedBefore = session.engine.state.judged;
    const scoreBefore = session.engine.state.score;
    expect(judgedBefore).toBeGreaterThan(0);

    const t = session.now();
    const at = session.toPractice(0.5)!;
    expect(at).toBeGreaterThanOrEqual(t + TEMPO_CHANGE_MARGIN_SECONDS);
    expect(((at - session.startAt) / SPB) % 4).toBeCloseTo(0, 6);
    expect(session.handoffAt).toBe(at);
    expect(session.practice?.speed).toBe(0.5);
    expect(session.toPractice(0.7)).toBeNull();
    expect(session.engine.state.score).toBe(scoreBefore);

    // Depois da virada, a música anda pela metade: cada compasso leva o dobro
    const later = session.engine.notes.filter((n) => n.time >= at);
    expect(later[1].time - later[0].time).toBeCloseTo(2 * SPB, 6);
    expect(session.clock.segments(at + 1).at(-1)).toMatchObject({ spb: 2 * SPB });

    run(at + songDurationSeconds(SONG) * 2 + 2);
    const done = events.find((e) => e.type === 'done');
    expect(done).toBeDefined();
    const result = (done as { result: PracticeResult }).result;
    expect(result.badges).toEqual([]);
    expect(result.laps.length).toBeGreaterThan(0);
    expect(result.judgments).toHaveLength(session.engine.notes.length);
    expect(result.judgments.map((j) => j.index)).toEqual(session.engine.notes.map((n) => n.index));
    expect(result.counts.miss).toBe(0);
    expect(result.score).toBeGreaterThan(scoreBefore);
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
  });

  it('?simular na prática: ligar o laço depois de B não faz o violinista sintético errar', () => {
    const { session, events, run } = rig({ practice: { loop: null, speed: 1 } });
    run(session.startAt + 5.3 * 4 * SPB);
    session.practice!.setLoop({ startMeasure: 2, endMeasure: 3 });
    run(session.startAt + 30);
    session.practice!.stop();
    const judged = events.filter((e) => e.type === 'judgment');
    expect(judged.length).toBeGreaterThan(30);
    expect(judged.filter((e) => e.type === 'judgment' && e.judgment === 'miss')).toEqual([]);
  });

  it('a prática de começo não vira de novo', () => {
    const { session } = rig({ practice: { loop: null, speed: 0.7 } });
    expect(session.toPractice(0.5)).toBeNull();
  });
});

describe('metrônomo', () => {
  it('desligado não agenda nada além da contagem; ligado clica nos tempos, pelo ganho', () => {
    const { session, clicks, gains, run } = rig();
    run(session.startAt + 1);
    expect(clicks).toHaveBeenCalledTimes(1);
    session.setMetronome(0.4);
    run(session.startAt + 3);
    const times = clicks.mock.calls.slice(1).flatMap((c) => c[1]);
    // Ligado logo depois do tempo de startAt + 1: o primeiro clique é o tempo seguinte
    const expected = beatTimes(session.clock.segments(session.startAt + 3), session.startAt + 1.01, session.startAt + 3);
    expect(times.filter((t) => t < session.startAt + 3)).toEqual(expected.map((t) => expect.closeTo(t, 6)));
    expect(gains).toHaveLength(1);
    expect(gains[0].gain.value).toBe(0.4);
    expect(clicks.mock.calls[1][2]).toBe(gains[0]);
    session.setMetronome(0);
    const calls = clicks.mock.calls.length;
    run(session.startAt + 4);
    expect(clicks.mock.calls.length).toBe(calls);
  });

  it('não clica antes do primeiro tempo da música (o compasso de entrada já tem os seus)', () => {
    const { session, clicks, run } = rig({ metronome: 1 });
    run(session.startAt - 0.1);
    const ticks = clicks.mock.calls.slice(1).flatMap((c) => c[1]);
    expect(ticks.length).toBeGreaterThan(0);
    expect(Math.min(...ticks)).toBeCloseTo(session.startAt, 6);
  });
});
