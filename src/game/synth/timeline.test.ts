import { describe, expect, it } from 'vitest';
import { scheduleNotes } from '../engine/engine';
import { parseSong, songDurationBeats, timeline as songTimeline, type Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { orchestraBeats, placeNote, scheduleOrchestra, type BeatNote } from './schedule';
import { between, createTimeline, timeIn, type Timeline, type TimelineSpan } from './timeline';

const START_AT = 7.3;
const TICK = 0.025;
const LOOKAHEAD = 0.2;

function threeMinuteSong(): Song {
  const ode = findFixedSong('ode-a-alegria')!.song;
  const measures = [];
  while (measures.length * 4 * (60 / ode.bpm) < 180) measures.push(...ode.measures);
  return parseSong({ ...ode, id: 'ode-longa', measures });
}

interface Placed {
  note: BeatNote;
  time: number;
  span: TimelineSpan;
}

/** O agendador sem AudioContext: passadas de 25 ms colocando o que começa até agora + 200 ms. */
function run(line: Timeline, notes: readonly BeatNote[], from: number, until: number, each?: (now: number) => void) {
  const cursor = line.cursor(from);
  const placed: Placed[] = [];
  const spans: TimelineSpan[] = [];
  for (let i = 0; from + i * TICK < until; i++) {
    const now = from + i * TICK;
    each?.(now);
    for (const span of cursor.advance(now + LOOKAHEAD)) {
      spans.push(span);
      for (const note of between(notes, span.fromBeat, span.toBeat)) placed.push({ note, time: placeNote(note, span).time, span });
    }
  }
  return { placed, spans };
}

const measureStart = (song: Song, measure: number) => song.measures.slice(0, measure).reduce((sum, m) => sum + m.beats, 0);

describe('linha do tempo num andamento só', () => {
  const song = threeMinuteSong();
  const notes = orchestraBeats(song);

  it('3 min com relógio simulado, passadas de 25 ms: cada nota uma vez, bit a bit startAt + tempo × 60/bpm, sem deriva', () => {
    const line = createTimeline(song, { startAt: START_AT, bpm: 92 });
    const { placed } = run(line, notes, 0, START_AT + songDurationBeats(song) * (60 / 92) + 1);
    expect(placed.map((p) => p.note)).toEqual(notes);
    const pure = scheduleOrchestra(song, { startAt: START_AT, bpm: 92 });
    expect(placed.map((p) => p.time)).toEqual(pure.map((n) => n.time));
    expect(placed.at(-1)!.time - START_AT).toBeGreaterThan(170);
  });

  it('o mesmo instante do Motor, bit a bit, em cada ataque que abre um acorde', () => {
    const line = createTimeline(song, { startAt: START_AT });
    const { placed } = run(line, notes, 0, START_AT + 200);
    const engine = new Set(scheduleNotes(song, START_AT).map((n) => n.time));
    const bass = placed.filter((p) => p.note.part === 'bass');
    for (const p of bass) expect(engine.has(p.time)).toBe(true);
  });

  it('partição exata: cada trecho começa onde o anterior parou, e cobre do início ao fim', () => {
    const line = createTimeline(song, { startAt: START_AT });
    const { spans } = run(line, notes, START_AT - 1, START_AT + 30);
    for (let i = 1; i < spans.length; i++) expect(spans[i].fromBeat).toBe(spans[i - 1].toBeat);
    expect(spans[0].fromBeat).toBeLessThan(0);
  });
});

describe('setTempo', () => {
  const song = threeMinuteSong();
  const notes = orchestraBeats(song);
  const spb = 60 / song.bpm;

  it.each([0.5, 0.75, 1])('fator %s no meio: nenhuma nota duplicada nem perdida, e as de depois no andamento novo', (factor) => {
    const line = createTimeline(song, { startAt: START_AT });
    const asked = START_AT + 20.013;
    let at = NaN;
    const { placed } = run(line, notes, 0, START_AT + 400, (now) => {
      if (Math.abs(now - (asked - 1)) < TICK / 2) at = line.setTempo(factor, asked);
    });
    expect(at).toBe(asked);
    expect(placed.map((p) => p.note)).toEqual(notes);
    const switchBeat = line.beatAt(at);
    for (const { note, time } of placed) {
      if (note.beat < switchBeat) expect(time).toBe(START_AT + note.beat * spb);
      else expect(time).toBeCloseTo(at + ((note.beat - switchBeat) * spb) / factor, 9);
    }
    for (let i = 1; i < placed.length; i++) expect(placed[i].time).toBeGreaterThanOrEqual(placed[i - 1].time);
  });

  it('pedida antes do horizonte (agora + 200 ms): vale no horizonte, e devolve esse instante real', () => {
    const line = createTimeline(song, { startAt: START_AT });
    const cursor = line.cursor(0);
    const now = START_AT + 5;
    cursor.advance(now + LOOKAHEAD);
    expect(line.committed).toBe(now + LOOKAHEAD);
    expect(line.setTempo(0.5, now)).toBe(now + LOOKAHEAD);
    const [, after] = line.segments(now + 1);
    expect(after).toMatchObject({ time: now + LOOKAHEAD, spb: 2 * spb });
    expect(after.beat).toBe(line.beatAt(now + LOOKAHEAD));
  });

  it('a pedida depois substitui a que ainda não valeu', () => {
    const line = createTimeline(song, { startAt: START_AT });
    line.setTempo(0.5, START_AT + 10);
    line.setTempo(0.8, START_AT + 5);
    expect(line.segments(START_AT + 60).map((s) => s.spb)).toEqual([spb, spb / 0.8]);
  });

  it.each([0.49, 1.01, 0, -1, NaN, Infinity])('fator %s fora de 0,5–1: recusado', (factor) => {
    const line = createTimeline(song, { startAt: START_AT });
    expect(() => line.setTempo(factor, START_AT)).toThrow(RangeError);
  });
});

describe('setLoop (A–B)', () => {
  const song = threeMinuteSong();
  const notes = orchestraBeats(song);
  const spb = 60 / song.bpm;
  const A = 2;
  const B = 3;
  const startBeat = measureStart(song, A);
  const endBeat = measureStart(song, B + 1);
  const lap = (endBeat - startBeat) * spb;

  it('10 voltas sem deriva: cada salto em startAt + fim de B + k × volta, as notas de A–B repetidas, nenhuma de depois de B', () => {
    const line = createTimeline(song, { startAt: START_AT });
    line.setLoop({ startMeasure: A, endMeasure: B });
    const firstJump = START_AT + endBeat * spb;
    const { placed } = run(line, notes, 0, firstJump + 10 * lap - LOOKAHEAD - 0.01);
    const jumps = line.segments(line.committed).slice(1);
    expect(jumps).toHaveLength(10);
    jumps.forEach((segment, k) => {
      expect(segment.beat).toBe(startBeat);
      expect(segment.time).toBeCloseTo(firstJump + k * lap, 9);
    });
    expect(placed.some((p) => p.note.beat >= endBeat)).toBe(false);
    const inLoop = notes.filter((n) => n.beat >= startBeat && n.beat < endBeat);
    for (const note of inLoop) expect(placed.filter((p) => p.note === note)).toHaveLength(11);
    for (const note of notes.filter((n) => n.beat < startBeat)) expect(placed.filter((p) => p.note === note)).toHaveLength(1);
    const lastLap = placed.filter((p) => p.span.time === jumps[9].time);
    for (const { note, time } of lastLap) expect(time).toBeCloseTo(firstJump + 9 * lap + (note.beat - startBeat) * spb, 9);
  });

  it('desligar o laço segue a música do fim de B, sem nota duplicada nem perdida', () => {
    const line = createTimeline(song, { startAt: START_AT });
    line.setLoop({ startMeasure: A, endMeasure: B });
    const firstJump = START_AT + endBeat * spb;
    const { placed } = run(line, notes, 0, firstJump + 3 * lap + 60, (now) => {
      if (Math.abs(now - (firstJump + 2.5 * lap)) < TICK / 2) line.setLoop(null);
    });
    const after = placed.filter((p) => p.note.beat >= endBeat);
    expect(after.map((p) => p.note)).toEqual(notes.filter((n) => n.beat >= endBeat && n.beat < after.at(-1)!.note.beat + 1e-9));
    expect(after[0].time).toBeCloseTo(firstJump + 3 * lap, 9);
  });

  it('ligado com a música já depois de B: salta no próximo início de compasso', () => {
    const line = createTimeline(song, { startAt: START_AT });
    const cursor = line.cursor(0);
    const now = START_AT + (endBeat + 1.5) * spb;
    cursor.advance(now);
    expect(line.setLoop({ startMeasure: A, endMeasure: B })).toBe(now);
    const nextMeasure = measureStart(song, B + 2);
    const [first, jump] = line.segments(now + 10);
    expect(first.endBeat).toBe(nextMeasure);
    expect(jump).toMatchObject({ beat: startBeat });
    expect(jump.time).toBeCloseTo(START_AT + nextMeasure * spb, 9);
  });

  it('com troca de andamento dentro do laço: cada volta no andamento novo, partição exata', () => {
    const line = createTimeline(song, { startAt: START_AT });
    line.setLoop({ startMeasure: A, endMeasure: B });
    const firstJump = START_AT + endBeat * spb;
    const { placed, spans } = run(line, notes, 0, firstJump + 4 * lap, (now) => {
      if (Math.abs(now - (firstJump + 0.3 * lap)) < TICK / 2) line.setTempo(0.5, now + 0.5);
    });
    const segments = line.segments(firstJump + 4 * lap);
    expect(segments.at(-1)!.spb).toBe(2 * spb);
    for (let i = 1; i < spans.length; i++) {
      if (spans[i].time === spans[i - 1].time) expect(spans[i].fromBeat).toBe(spans[i - 1].toBeat);
    }
    const lastLap = segments.at(-1)!;
    for (const p of placed.filter((x) => x.span.time === lastLap.time)) expect(p.time).toBe(timeIn(lastLap, p.note.beat));
  });

  it('compassos fora da música ou invertidos: recusado', () => {
    const line = createTimeline(song, { startAt: START_AT });
    expect(() => line.setLoop({ startMeasure: 3, endMeasure: 2 })).toThrow(RangeError);
    expect(() => line.setLoop({ startMeasure: 0, endMeasure: song.measures.length })).toThrow(RangeError);
    expect(() => line.setLoop({ startMeasure: -1, endMeasure: 2 })).toThrow(RangeError);
  });

  it('o laço cobre os ataques do violino do mesmo jeito (a queda nos ataques segue o laço)', () => {
    const attacks = songTimeline(song).map((n) => ({ beat: n.at }));
    const line = createTimeline(song, { startAt: START_AT });
    line.setLoop({ startMeasure: A, endMeasure: B });
    const cursor = line.cursor(0);
    let count = 0;
    for (let now = 0; now < START_AT + endBeat * spb + 2 * lap - 0.5; now += TICK) {
      for (const span of cursor.advance(now + LOOKAHEAD)) count += between(attacks, span.fromBeat, span.toBeat).length;
    }
    const before = attacks.filter((a) => a.beat < startBeat).length;
    const inLoop = attacks.filter((a) => a.beat >= startBeat && a.beat < endBeat).length;
    expect(count).toBe(before + 3 * inLoop);
  });
});
