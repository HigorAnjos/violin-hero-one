import { describe, expect, it, vi } from 'vitest';
import type { EngineNote, PracticeEvent, PracticeResult } from '../game/engine';
import { DETECTION_LAG_SECONDS } from '../game/engine/judge';
import { reading, scaleSong } from '../game/engine/testing';
import { attacks, type Song } from '../game/notation/song';
import { LOOKAHEAD_SECONDS, createTimeline, type LoopRange } from '../game/synth';
import { between, timeIn } from '../game/synth/timeline';
import type { EarAudio } from './Ear';
import { countInTimes, createGameSession, LEAD_SECONDS, type PracticeStart, type SessionEvent } from './gameSession';
import type { GameOrchestra, OrchestraStart } from './orchestra';

const FRAME = 1 / 60;
const SONG = scaleSong(3);
const SPB = 60 / SONG.bpm;
const LOOP: LoopRange = { startMeasure: 2, endMeasure: 3 };
const LAP_BEATS = 8;

/**
 * A orquestra falsa com o agendador de verdade: a linha do tempo do synth, que coloca cada ataque do violino até agora
 * + 200 ms no relógio do contexto, recebendo os mesmos setTempo e setLoop da shell. A escala não tem ligadas.
 */
function timelineOrchestra(song: Song, context: { currentTime: number }) {
  const placed: { time: number; midi: number }[] = [];
  let made: (GameOrchestra & { tick(): void; options: OrchestraStart }) | null = null;
  const beats = attacks(song).map((n) => ({ beat: n.at, midi: n.midi }));
  const factory = vi.fn(async (_c: BaseAudioContext, _s: Song, options: OrchestraStart) => {
    const line = createTimeline(song, { startAt: options.startAt, factor: options.tempo });
    const cursor = line.cursor(context.currentTime);
    made = {
      options,
      tick() {
        for (const span of cursor.advance(context.currentTime + LOOKAHEAD_SECONDS)) {
          for (const b of between(beats, span.fromBeat, span.toBeat)) placed.push({ time: timeIn(span, b.beat), midi: b.midi });
        }
      },
      update: vi.fn(),
      soundingAt: () => [],
      setVolume: vi.fn(),
      setTempo: vi.fn((factor: number, at = context.currentTime) => line.setTempo(factor, Math.max(at, context.currentTime + LOOKAHEAD_SECONDS))),
      setLoop: vi.fn((range: LoopRange | null) => line.setLoop(range)),
      stop: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    };
    return made;
  });
  return { factory, placed, get made() {
    return made;
  } };
}

async function rig(practice: PracticeStart) {
  const context = { currentTime: 10, state: 'running', suspend: vi.fn(async () => undefined), resume: vi.fn(async () => undefined) };
  const audio = { context, source: {}, stream: null } as unknown as EarAudio;
  const orchestra = timelineOrchestra(SONG, context);
  const events: SessionEvent[] = [];
  const track = { update: vi.fn(), onJudgment: vi.fn(), setNotes: vi.fn<(notes: readonly EngineNote[]) => void>() };
  const clicks = vi.fn(() => () => undefined);
  const session = createGameSession({
    song: SONG,
    audio,
    a4: 442,
    latencySeconds: 0,
    orchestra: orchestra.factory,
    clicks,
    practice,
    onEvent: (e) => events.push(e),
  });
  session.setTrack(track);
  await vi.waitFor(() => expect(orchestra.made).not.toBeNull());
  let heard = 0;
  /** Quadros de 1/60 s; o violinista toca 200 ms de cada ataque que a orquestra colocou, em leituras de 10 ms. */
  const run = (until: number, each?: (t: number) => void) => {
    while (context.currentTime < until) {
      const from = context.currentTime;
      context.currentTime += FRAME;
      each?.(context.currentTime);
      orchestra.made!.tick();
      for (let t = Math.ceil(from * 100) / 100; t < context.currentTime; t += 0.01) {
        while (heard + 1 < orchestra.placed.length && orchestra.placed[heard + 1].time + DETECTION_LAG_SECONDS <= t) heard++;
        const s = orchestra.placed[heard];
        const on = s && s.time >= session.startAt - 1e-9 && t >= s.time + DETECTION_LAG_SECONDS && t < s.time + DETECTION_LAG_SECONDS + 0.2;
        session.push(on ? reading(t, s.midi) : null);
      }
      session.frame();
    }
  };
  const judgments = () => events.filter((e): e is Extract<PracticeEvent, { type: 'judgment' }> => e.type === 'judgment' && 'lap' in e);
  return { session, context, orchestra, events, track, clicks, judgments, run };
}

describe('prática na partida', () => {
  it('loop A–B 10× a 75%: sem deriva entre motor, pista e orquestra, cada nota julgada uma vez', async () => {
    const speed = 0.75;
    const { session, orchestra, track, judgments, run } = await rig({ loop: LOOP, speed });
    const lap = (LAP_BEATS * SPB) / speed;
    expect(orchestra.made!.options).toMatchObject({ tempo: speed });
    expect(orchestra.made!.setLoop).toHaveBeenCalledWith(LOOP);
    run(session.startAt + 10 * lap - 0.1);
    session.practice!.stop();

    const js = judgments();
    expect(js).toHaveLength(80);
    // As leituras caem na grade de 10 ms do Ouvido: o desvio é só esse arredondamento, igual na volta 0 e na 9
    expect(js.every((j) => j.judgment === 'perfect' && Math.abs(j.offsetMs!) <= 10 + 1e-6)).toBe(true);
    expect(new Set(js.map((j) => j.index)).size).toBe(80);

    const notes = track.setNotes.mock.lastCall![0];
    const played = orchestra.placed.filter((p) => p.time >= session.startAt - 1e-9);
    for (let i = 0; i < 80; i++) expect(notes[i].time).toBeCloseTo(played[i].time, 9);
    expect(played[79].time - session.startAt).toBeCloseTo(9 * lap + 7 * (SPB / speed), 9);
    expect(track.update).toHaveBeenLastCalledWith(session.now());
  });

  it('trocar a velocidade no meio da volta: vale no compasso seguinte, sem nota julgada duas vezes nem perdida', async () => {
    const { session, orchestra, judgments, run } = await rig({ loop: LOOP, speed: 1 });
    let at: number | null = null;
    run(session.startAt + 30, (t) => {
      if (at === null && t >= session.startAt + 1.2 * SPB) at = session.practice!.setSpeed(0.5);
    });
    session.practice!.stop();
    expect(at).toBeCloseTo(session.startAt + 4 * SPB, 9);
    expect(orchestra.made!.setTempo).toHaveBeenCalledWith(0.5, at);
    const js = judgments();
    expect(js.every((j) => j.judgment === 'perfect')).toBe(true);
    const perLap = new Map<number, number[]>();
    for (const j of js) perLap.set(j.lap, [...(perLap.get(j.lap) ?? []), j.noteIndex]);
    const full = [8, 9, 10, 11, 12, 13, 14, 15];
    for (const [lap, indices] of perLap) if (lap < perLap.size - 1) expect(indices).toEqual(full);
    expect(session.practice!.speed).toBe(0.5);
  });

  it('a pista ganha as notas de cada volta antes de elas aparecerem no topo', async () => {
    const { session, track, run } = await rig({ loop: LOOP, speed: 1 });
    const lap = LAP_BEATS * SPB;
    run(session.startAt + lap - LEAD_SECONDS - 0.1);
    const notes = track.setNotes.mock.lastCall![0];
    expect(notes.some((n) => Math.abs(n.time - (session.startAt + lap)) < 1e-9)).toBe(true);
  });

  it('o relógio da partitura: os trechos desde o começo, com o salto do laço', async () => {
    const { session } = await rig({ loop: LOOP, speed: 1 });
    const lap = LAP_BEATS * SPB;
    const segments = session.clock.segments(session.startAt + lap + 0.1);
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({ beat: 8 });
    expect(segments[1].time).toBeCloseTo(session.startAt + lap, 9);
    expect(session.beatAt(session.startAt + lap + SPB)).toBeCloseTo(9, 9);
  });

  it('compasso de entrada no andamento da prática', async () => {
    const { session, clicks } = await rig({ loop: LOOP, speed: 0.5 });
    expect(clicks).toHaveBeenCalledWith(expect.anything(), countInTimes(SONG, session.startAt, 10.05, SONG.bpm * 0.5));
  });

  it('stop: resultado com as voltas, a melhor volta, e a orquestra sai', async () => {
    const { session, orchestra, events, run } = await rig({ loop: LOOP, speed: 1 });
    run(session.startAt + 2 * LAP_BEATS * SPB + 0.3);
    session.practice!.stop();
    const done = events.find((e) => e.type === 'done');
    const result = (done as unknown as { result: PracticeResult }).result;
    expect(result.laps.map((l) => l.complete)).toEqual([true, true, false]);
    expect(result.bestLap).toBe(0);
    expect(orchestra.made!.stop).toHaveBeenCalled();
    expect(events.filter((e) => e.type === 'lap')).toHaveLength(2);
  });

  it('desligar o laço segue a música até o fim e termina sozinha', async () => {
    const { session, events, judgments, run } = await rig({ loop: LOOP, speed: 1 });
    run(session.startAt + 40, (t) => {
      if (t >= session.startAt + 1 && session.practice!.loop) session.practice!.setLoop(null);
    });
    expect(events.at(-1)?.type).toBe('done');
    expect(judgments()).toHaveLength(16);
  });
});
