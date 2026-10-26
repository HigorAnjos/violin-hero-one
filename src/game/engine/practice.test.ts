import { describe, expect, it } from 'vitest';
import { attacks, type Song } from '../notation/song';
import { between, createTimeline, timeIn, type LoopRange, type Timeline } from '../synth/timeline';
import { DETECTION_LAG_SECONDS } from './judge';
import { createPractice, nextMeasureTime, type PracticeEvent } from './practice';
import { A4, ODE, n, reading, scaleSong } from './testing';

const STEP = 0.01;
const LOOKAHEAD = 0.2;
const PLAN_AHEAD = 3;
const START = 4;

interface Sound {
  time: number;
  midi: number;
}

const measureStart = (song: Song, measure: number) => song.measures.slice(0, measure).reduce((sum, m) => sum + m.beats, 0);

/**
 * A orquestra sem AudioContext (a linha do tempo com o cursor de 200 ms à frente) e um violinista que toca cada ataque
 * que ela coloca, na hora certa, 200 ms de som. Cada volta reataca a primeira nota de A, como quem recomeça o trecho.
 */
function rig(song: Song, { from = 0, factor = 1, loop = null as LoopRange | null } = {}) {
  const spb = 60 / song.bpm / factor;
  const startBeat = measureStart(song, from);
  const line: Timeline = createTimeline(song, { startAt: START - startBeat * spb, factor });
  if (loop) line.setLoop(loop);
  const events: PracticeEvent[] = [];
  const practice = createPractice({ song, from, startAt: START, a4: A4, onEvent: (e) => events.push(e) });
  const cursor = line.cursor(0);
  const beats = attacks(song).map((note) => ({ beat: note.at, midi: note.midi }));
  const loopStart = () => (line.loop ? measureStart(song, line.loop.startMeasure) : -1);
  const first = (beat: number) => song.measures.flatMap((m, i) => m.notes.map((x) => ({ beat: measureStart(song, i) + x.beat, midi: x.midi }))).find((x) => x.beat === beat);
  const sounds: Sound[] = [];
  const opening = first(startBeat);
  if (opening && !beats.some((b) => b.beat === startBeat)) sounds.push({ time: START, midi: opening.midi });
  let tick = 0;
  let sounding = 0;
  const now = () => tick * STEP;

  const run = (until: number, each?: (t: number) => void) => {
    while (now() < until) {
      const t = now();
      each?.(t);
      for (const span of cursor.advance(t + LOOKAHEAD)) {
        const jumpIn = span.fromBeat === span.beat && span.beat === loopStart() && span.time > START;
        if (jumpIn && !beats.some((b) => b.beat === span.beat)) sounds.push({ time: span.time, midi: first(span.beat)!.midi });
        for (const b of between(beats, span.fromBeat, span.toBeat)) {
          const time = timeIn(span, b.beat);
          if (time >= START - 1e-9) sounds.push({ time, midi: b.midi });
        }
      }
      while (sounding + 1 < sounds.length && sounds[sounding + 1].time + DETECTION_LAG_SECONDS <= t) sounding++;
      const s = sounds[sounding];
      const playing = s && t >= s.time + DETECTION_LAG_SECONDS && t < s.time + DETECTION_LAG_SECONDS + 0.2;
      practice.push(playing ? reading(t, s.midi) : null);
      practice.sync(line.segments(t + PLAN_AHEAD), line.loop, t);
      practice.advance(t);
      tick++;
    }
  };
  const judgments = () => events.filter((e): e is Extract<PracticeEvent, { type: 'judgment' }> => e.type === 'judgment');
  return { line, practice, events, judgments, run, sounds, now };
}

describe('prática: loop A–B', () => {
  const song = scaleSong(3);
  const loop = { startMeasure: 2, endMeasure: 3 };

  it('10 voltas sem deriva: motor, pista e orquestra no mesmo instante, cada nota julgada uma vez, Perfeito', () => {
    const { line, practice, judgments, run, sounds } = rig(song, { from: 2, loop });
    const lapSeconds = 8 * (60 / song.bpm);
    run(START + 10 * lapSeconds - 0.2);
    practice.stop();

    const js = judgments();
    expect(js).toHaveLength(80);
    expect(js.every((j) => j.judgment === 'perfect')).toBe(true);
    expect(Math.max(...js.map((j) => Math.abs(j.offsetMs!)))).toBeLessThan(1e-6);
    expect(new Set(js.map((j) => j.index)).size).toBe(80);

    // A pista recebe practice.notes: o mesmo instante que a orquestra põe cada ataque, volta após volta
    const played = sounds.filter((s) => s.time >= START - 1e-9).slice(0, 80);
    practice.notes.slice(0, 80).forEach((note, i) => expect(note.time).toBeCloseTo(played[i].time, 9));
    const jumps = line.segments(START + 10 * lapSeconds).filter((s, i, all) => i > 0 && all[i - 1].endBeat !== s.beat);
    jumps.slice(0, 9).forEach((jump, k) => expect(jump.time).toBeCloseTo(START + (k + 1) * lapSeconds, 9));

    const result = practice.result();
    expect(result.laps).toHaveLength(10);
    expect(result.laps.slice(0, 9).every((l) => l.complete && l.accuracy === 100 && l.from === 2 && l.to === 4)).toBe(true);
    expect(result.laps[9].complete).toBe(false);
    expect(result.bestLap).toBe(0);
    expect(result.badges).toEqual([]);
  });

  it('a primeira nota de cada volta é julgada, mesmo a ligada que abre o trecho (vira ataque)', () => {
    const tied: Song = {
      ...ODE,
      bpm: 120,
      measures: [{ beats: 4, notes: [n(0, 4, 78, 3, 1)] }, { beats: 4, notes: [n(0, 2, 78, 3, 1, true), n(2, 2, 76, 3, 0)] }],
    };
    const { practice, judgments, run } = rig(tied, { from: 1, loop: { startMeasure: 1, endMeasure: 1 } });
    run(START + 5 * 2 - 0.3);
    const js = judgments();
    expect(js.map((j) => [j.lap, j.noteIndex, j.judgment])).toEqual(
      [0, 1, 2, 3, 4].flatMap((lap) => [
        [lap, 1, 'perfect'],
        [lap, 2, 'perfect'],
      ]),
    );
    expect(practice.laps.slice(0, 4).every((l) => l.notes === 2)).toBe(true);
  });

  it('precisão por volta e melhor volta: a volta sem erro ganha', () => {
    const { practice, run, sounds, events } = rig(song, { from: 2, loop });
    const lapSeconds = 8 * (60 / song.bpm);
    // Na volta 0 o violinista cala a 3ª nota
    run(START + 3 * lapSeconds - 0.2, () => {
      const third = sounds.findIndex((s) => Math.abs(s.time - (START + 2 * (60 / song.bpm))) < 1e-6);
      if (third >= 0) sounds[third].midi = 0;
    });
    practice.stop();
    const result = practice.result();
    expect(result.laps[0].counts.miss).toBe(1);
    expect(result.laps[0].accuracy).toBeCloseTo((7 * 100) / 8, 9);
    expect(result.laps[1].accuracy).toBe(100);
    expect(result.bestLap).toBe(1);
    expect(events.filter((e) => e.type === 'lap').map((e) => e.type === 'lap' && e.summary.lap)).toEqual([0, 1]);
    expect(result.accuracy).toBeCloseTo((23 * 100) / 24, 9);
  });

  it('desligar o laço segue até o fim da música e termina sozinho', () => {
    const { line, practice, judgments, run, events } = rig(song, { from: 2, loop });
    const lapSeconds = 8 * (60 / song.bpm);
    run(START + 30, (t) => {
      if (Math.abs(t - (START + 1.5 * lapSeconds)) < STEP / 2) line.setLoop(null);
    });
    expect(practice.status).toBe('finished');
    expect(events.at(-1)?.type).toBe('done');
    // volta 0 (A–B) + volta 1 de A até o fim (compassos 2 a 5)
    expect(judgments()).toHaveLength(8 + 16);
    expect(judgments().every((j) => j.judgment === 'perfect')).toBe(true);
    expect(practice.result().laps.map((l) => [l.from, l.to, l.complete])).toEqual([
      [2, 4, true],
      [2, 6, true],
    ]);
  });
});

describe('prática: troca de andamento', () => {
  it.each([0.5, 0.75])('para %s no meio do loop: nenhuma nota julgada duas vezes nem perdida, e as de depois no andamento novo', (factor) => {
    const song = scaleSong(3);
    const loop = { startMeasure: 2, endMeasure: 3 };
    const { line, practice, judgments, run } = rig(song, { from: 2, loop });
    const spb = 60 / song.bpm;
    let at: number | null = null;
    run(START + 30, (t) => {
      if (at === null && t >= START + 2.3 * spb) {
        at = nextMeasureTime(song, line.segments(t + PLAN_AHEAD), t + 0.3);
        expect(line.setTempo(factor, at!)).toBe(at);
      }
    });
    practice.stop();
    expect(at).toBeCloseTo(START + 4 * spb, 9);
    const js = judgments();
    expect(js.every((j) => j.judgment === 'perfect')).toBe(true);
    expect(new Set(js.map((j) => j.index)).size).toBe(js.length);
    // Volta 0 inteira (8 notas): metade no andamento antigo, metade no novo, cada nota uma vez
    expect(js.filter((j) => j.lap === 0).map((j) => j.noteIndex)).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    const after = practice.notes.filter((note) => note.time >= at!);
    for (let i = 1; i < after.length; i++) {
      const gap = after[i].time - after[i - 1].time;
      expect(gap === 0 || Math.abs(gap - spb / factor) < 1e-9 || after[i].measure === 2).toBe(true);
    }
    expect(practice.result().laps[0].factors).toEqual([1, factor]);
    expect(practice.result().laps[1].factors).toEqual([factor]);
  });

  it('pedida no meio de um compasso: vale no próximo início de compasso, nunca antes de agora + 300 ms', () => {
    const song = scaleSong(2);
    const line = createTimeline(song, { startAt: START });
    const spb = 60 / song.bpm;
    expect(nextMeasureTime(song, line.segments(START + 10), START + 1.2 * spb)).toBeCloseTo(START + 4 * spb, 9);
    expect(nextMeasureTime(song, line.segments(START + 10), START + 4 * spb)).toBeCloseTo(START + 4 * spb, 9);
    expect(nextMeasureTime(song, line.segments(START + 10), START + 13 * spb)).toBeNull();
  });

  it('com o laço, o próximo compasso depois de B é o início de A', () => {
    const song = scaleSong(3);
    const line = createTimeline(song, { startAt: START });
    line.setLoop({ startMeasure: 0, endMeasure: 1 });
    const spb = 60 / song.bpm;
    expect(nextMeasureTime(song, line.segments(START + 20), START + 7.5 * spb)).toBeCloseTo(START + 8 * spb, 9);
    expect(line.beatAt(START + 8 * spb)).toBe(0);
  });

  it('troca sem loop, com ligada no compasso da troca: a ligada segue a nota de antes e não é julgada', () => {
    const song: Song = {
      ...ODE,
      bpm: 120,
      measures: [
        { beats: 4, notes: [n(0, 4, 78, 3, 1)] },
        { beats: 4, notes: [n(0, 2, 78, 3, 1, true), n(2, 2, 76, 3, 0)] },
        { beats: 4, notes: [n(0, 4, 74, 2, 3)] },
      ],
    };
    const { line, practice, judgments, run } = rig(song);
    let at: number | null = null;
    run(START + 20, (t) => {
      if (at === null && t >= START + 1) {
        at = nextMeasureTime(song, line.segments(t + PLAN_AHEAD), t + 0.3);
        line.setTempo(0.5, at!);
      }
    });
    expect(at).toBeCloseTo(START + 2, 9);
    expect(practice.status).toBe('finished');
    expect(judgments().map((j) => [j.noteIndex, j.judgment])).toEqual([
      [0, 'perfect'],
      [2, 'perfect'],
      [3, 'perfect'],
    ]);
  });
});

describe('prática: placar', () => {
  it('combo e multiplicador seguem de um motor para o outro', () => {
    const song = scaleSong(3);
    const { practice, judgments, run } = rig(song, { from: 2, loop: { startMeasure: 2, endMeasure: 3 } });
    run(START + 2 * 8 * (60 / song.bpm) - 0.3);
    const js = judgments();
    expect(js[10].state).toMatchObject({ combo: 11, multiplier: 2 });
    expect(js[10].lap).toBe(1);
    expect(practice.state.judged).toBe(js.length);
  });

  it('stop antes de tudo: resultado vazio, sem melhor volta', () => {
    const { practice } = rig(scaleSong(1));
    practice.stop();
    expect(practice.status).toBe('finished');
    expect(practice.result()).toMatchObject({ judgments: [], laps: [], bestLap: null });
  });

  it('compasso inicial fora da música: recusado', () => {
    expect(() => createPractice({ song: ODE, from: 4, startAt: 0 })).toThrow(RangeError);
  });
});
