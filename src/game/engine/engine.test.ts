import { describe, expect, it } from 'vitest';
import type { PitchReading } from '../audio/types';
import { attacks } from '../notation/song';
import { midiToFrequency } from '../notation/violin';
import { ENERGY_START } from './energy';
import { createEngine, scheduleNotes, type EngineOptions } from './engine';
import { DETECTION_LAG_SECONDS } from './judge';
import { A4, ODE, reading, scaleSong } from './testing';
import type { EngineEvent, NoteJudgment } from './types';

const START = 10;

function setup(options: Partial<EngineOptions> = {}) {
  const events: EngineEvent[] = [];
  const engine = createEngine({ song: ODE, startAt: START, a4: A4, ...options, onEvent: (e) => events.push(e) });
  const judgments = () => events.filter((e): e is EngineEvent & NoteJudgment & { type: 'judgment' } => e.type === 'judgment');
  /** Toca o ataque `index` com o desvio e a nota dados, 200 ms de som e um null no fim. */
  const play = (index: number, { offsetMs = 0, midiShift = 0, cents = 0, latency = 0 } = {}) => {
    const note = engine.notes[index];
    const first = note.time + offsetMs / 1000 + DETECTION_LAG_SECONDS + latency;
    const out: (PitchReading | null)[] = [];
    for (let k = 0; k <= 20; k++) out.push(reading(first + k * 0.01, note.midi + midiShift, cents));
    out.push(null);
    out.forEach((r) => engine.push(r));
  };
  return { engine, events, judgments, play };
}

describe('scheduleNotes', () => {
  it('só os ataques: a nota ligada não é julgada de novo e estende a duração da anterior', () => {
    const notes = scheduleNotes(ODE, START, ODE.bpm, A4);
    expect(notes).toHaveLength(attacks(ODE).length);
    expect(notes).toHaveLength(15);
    const last = notes[notes.length - 1];
    expect(last).toMatchObject({ index: 14, noteIndex: 14, measure: 3, midi: 76, string: 3 });
    expect(last.time).toBeCloseTo(START + 14 * 0.6, 9);
    expect(last.duration).toBeCloseTo(2 * 0.6, 9);
  });

  it('usa o BPM da partida e o Lá dado', () => {
    const slow = scheduleNotes(ODE, 0, 50, 415);
    expect(slow[1].time).toBeCloseTo(1.2, 9);
    expect(slow[0].frequency).toBeCloseTo(midiToFrequency(78, 415), 9);
  });
});

describe('julgamentos', () => {
  it('cada evento traz o julgamento, o motivo e o estado: pontos, combo, multiplicador, energia e precisão', () => {
    const { judgments, play } = setup();
    play(0);
    play(1, { offsetMs: 84 });
    play(2, { cents: 38 });
    expect(judgments().map((j) => [j.judgment, j.issue, j.points, j.state.score, j.state.combo])).toEqual([
      ['perfect', null, 100, 100, 1],
      ['great', 'late', 70, 170, 2],
      ['good', 'sharp', 40, 210, 3],
    ]);
    const last = judgments()[2];
    expect(last.state).toMatchObject({ multiplier: 1, maxCombo: 3, judged: 3, total: 15 });
    expect(last.state.energy).toBeCloseTo((ENERGY_START + 4 + 3 + 2) / 100, 9);
    expect(last.state.accuracy).toBeCloseTo((100 * 210) / 300, 9);
    expect(last.cents).toBeCloseTo(38, 6);
  });

  it('nota errada, atrasada, desafinada e não tocada saem distinguíveis', () => {
    const { engine, judgments, play } = setup();
    play(0, { midiShift: 2 });
    play(1, { offsetMs: 260 });
    play(2, { cents: -62 });
    engine.advance(engine.notes[3].time + 0.65);
    expect(judgments().map((j) => [j.judgment, j.issue])).toEqual([
      ['miss', 'wrong-note'],
      ['miss', 'late'],
      ['miss', 'flat'],
      ['miss', 'not-played'],
    ]);
    const [wrong, late, flat, silent] = judgments();
    expect(wrong).toMatchObject({ playedMidi: 80, midi: 78, string: 3, measure: 0 });
    expect(late.offsetMs).toBeCloseTo(260, 6);
    expect(flat.cents).toBeCloseTo(-62, 6);
    expect(silent).toMatchObject({ offsetMs: null, cents: null, playedMidi: null, points: 0 });
  });

  it('desconta a latência calibrada', () => {
    const { judgments, play } = setup({ latencySeconds: 0.142 });
    play(0, { latency: 0.142 });
    expect(judgments()[0]).toMatchObject({ judgment: 'perfect', offsetMs: expect.closeTo(0, 6) });
  });

  it('tolerância de afinação configurável', () => {
    const strict = setup({ toleranceCents: 20 });
    strict.play(0, { cents: 25 });
    strict.engine.advance(strict.engine.notes[0].time + 1);
    expect(strict.judgments()[0]).toMatchObject({ judgment: 'miss', issue: 'sharp' });

    const loose = setup({ toleranceCents: 70 });
    loose.play(0, { cents: 60 });
    expect(loose.judgments()[0]).toMatchObject({ judgment: 'good', issue: 'sharp' });
  });

  it('erro zera o combo e o multiplicador', () => {
    const song = scaleSong(2);
    const { engine, judgments, play } = setup({ song });
    for (let i = 0; i < 11; i++) play(i);
    expect(judgments()[10].state).toMatchObject({ combo: 11, multiplier: 2 });
    expect(judgments()[10].points).toBe(200);
    engine.advance(engine.notes[11].time + 1);
    expect(judgments()[11].state).toMatchObject({ combo: 0, multiplier: 1, maxCombo: 11 });
  });
});

describe('energia da orquestra e game over', () => {
  it('sobe com acertos até 1 e cai com erros', () => {
    const song = scaleSong(4);
    const { engine, judgments, play } = setup({ song });
    for (let i = 0; i < 12; i++) play(i);
    expect(judgments()[11].state.energy).toBe(1);
    engine.advance(engine.notes[12].time + 1);
    expect(judgments()[12].state.energy).toBeCloseTo(0.92, 9);
  });

  it('8 erros seguidos desde o começo param a orquestra: evento gameover e mais nada', () => {
    const { engine, events } = setup();
    engine.advance(START + 60);
    const types = events.map((e) => e.type);
    expect(types).toEqual([...Array(8).fill('judgment'), 'gameover']);
    expect(engine.status).toBe('failed');
    const result = engine.result();
    expect(result).toMatchObject({ status: 'failed', energy: 0, reachedMeasure: 1, totalMeasures: 4, badges: [] });
    expect(result.judgments).toHaveLength(8);
    engine.push(reading(START + 61, 78));
    engine.advance(START + 70);
    expect(events).toHaveLength(9);
  });

  it('no modo sem falha a energia fica em zero e a música vai até o fim', () => {
    const { engine, events } = setup({ noFail: true });
    engine.advance(START + 60);
    expect(events.at(-1)?.type).toBe('done');
    expect(engine.status).toBe('finished');
    expect(engine.result()).toMatchObject({ status: 'finished', energy: 0, counts: { miss: 15 } });
  });

  it('result() antes do fim lança', () => {
    const { engine } = setup();
    expect(() => engine.result()).toThrow();
    expect(engine.status).toBe('playing');
  });
});

describe('resultado', () => {
  it('afinação média e erros por corda, corda mais errada e selos novos', () => {
    const song = scaleSong(1);
    const { engine, events, play } = setup({ song, earnedBadges: ['primeira-musica'] });
    const cents = [-4, -2, 0, 6, 2, 0, 0, 0];
    engine.notes.forEach((note, i) => (note.string === 3 ? engine.advance(note.time + 1) : play(i, { cents: cents[i] })));
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    const result = engine.result();
    expect(result.status).toBe('finished');
    expect(result.strings.map((s) => [s.string, s.notes, s.hits, s.misses])).toEqual([
      [0, 3, 3, 0],
      [1, 2, 2, 0],
      [2, 2, 2, 0],
      [3, 1, 0, 1],
    ]);
    expect(result.strings[0].meanCents).toBeCloseTo(-2, 6);
    expect(result.strings[1].meanCents).toBeCloseTo(4, 6);
    expect(result.strings[3].meanCents).toBeNull();
    expect(result.mostMissedString).toBe(3);
    expect(result.meanAbsCents).toBeCloseTo(14 / 7, 6);
    expect(result.meanOffsetMs).toBeCloseTo(0, 6);
    expect(result.reachedMeasure).toBe(1);
    // 7 de 8 notas (87,5%) fica abaixo dos 90% da afinação de ouro; primeira música já era do jogador.
    expect(result.badges).toEqual([]);
  });

  it('música sem notas termina na hora', () => {
    const events: EngineEvent[] = [];
    const empty = { ...ODE, measures: [{ beats: 4, notes: [] }] };
    const engine = createEngine({ song: empty, startAt: 0, onEvent: (e) => events.push(e) });
    expect(engine.status).toBe('finished');
    expect(engine.result()).toMatchObject({ judgments: [], reachedMeasure: -1, mostMissedString: null, meanOffsetMs: null });
  });
});
