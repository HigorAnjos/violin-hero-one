import { describe, expect, it } from 'vitest';
import { scheduleNotes } from './engine';
import { parseSimulate, pickWrongNotes, renderPerformance, simulateGame } from './simulate';
import { A4, ODE, scaleSong } from './testing';

const game = { song: ODE, startAt: 5, a4: A4 };

describe('partida inteira com o violinista sintético', () => {
  it('no tempo e afinado: tudo Perfeito, combo cheio e os selos de música terminada', () => {
    const { result, events } = simulateGame(game);
    expect(result.status).toBe('finished');
    expect(result.counts).toEqual({ perfect: 15, great: 0, good: 0, miss: 0 });
    expect(result.maxCombo).toBe(15);
    expect(result.accuracy).toBe(100);
    expect(result.energy).toBe(1);
    expect(result.badges).toEqual(['primeira-musica', 'sem-erros', 'afinacao-de-ouro']);
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
    expect(events.at(-1)?.type).toBe('done');
  });

  it.each([
    [100, 'great', 'late'],
    [-100, 'great', 'early'],
    [180, 'good', 'late'],
  ] as const)('%s ms fora: todas %s (%s)', (offsetMs, judgment, issue) => {
    const { result } = simulateGame(game, { offsetMs });
    expect(result.judgments.every((j) => j.judgment === judgment && j.issue === issue)).toBe(true);
    expect(result.meanOffsetMs).toBeCloseTo(offsetMs, -1);
    expect(result.strings[3].meanOffsetMs).toBeCloseTo(offsetMs, -1);
  });

  it('com 3 erros: exatamente as notas erradas saem Errou por nota errada, e cada uma zera o combo', () => {
    const { result, wrong, events } = simulateGame(game, { errors: 3, seed: 7 });
    expect(wrong).toHaveLength(3);
    const misses = result.judgments.filter((j) => j.judgment === 'miss');
    expect(misses.map((j) => j.index)).toEqual(wrong);
    expect(misses.every((j) => j.issue === 'wrong-note' && j.playedMidi === j.midi + 2)).toBe(true);
    for (const index of wrong) {
      const e = events.find((ev) => ev.type === 'judgment' && ev.index === index);
      expect(e?.type === 'judgment' && e.state.combo).toBe(0);
    }
    expect(result.status).toBe('finished');
    expect(result.badges).toEqual(['primeira-musica']);
  });

  it('desafinado 38 ¢ alto: todas Bom com motivo alto, e a afinação média por corda mostra', () => {
    const { result } = simulateGame(game, { perNote: () => ({ cents: 38 }) });
    expect(result.counts.good).toBe(15);
    expect(result.judgments.every((j) => j.issue === 'sharp')).toBe(true);
    expect(result.strings[3].meanCents).toBeCloseTo(38, 0);
    expect(result.strings[3]).toMatchObject({ sharp: 13, flat: 0 });
    expect(result.strings[2]).toMatchObject({ sharp: 2, notes: 2 });
    expect(result.strings[0]).toMatchObject({ meanCents: null, meanOffsetMs: null, sharp: 0 });
  });

  it('corda Lá baixa 40 ¢ e o resto afinado: só a corda Lá conta baixas', () => {
    const { result } = simulateGame(game, { perNote: (n) => (n.string === 2 ? { cents: -40 } : undefined) });
    expect(result.strings[2]).toMatchObject({ flat: 2, sharp: 0, hits: 2 });
    expect(result.strings[2].meanCents).toBeCloseTo(-40, 0);
    expect(result.strings[3]).toMatchObject({ flat: 0, sharp: 0 });
    expect(result.judgments.filter((j) => j.issue === 'flat').every((j) => j.judgment === 'good')).toBe(true);
  });

  it('latência do aparelho é descontada pela calibração', () => {
    const { result } = simulateGame({ ...game, latencySeconds: 0.15 }, { latencySeconds: 0.15 });
    expect(result.counts.perfect).toBe(15);
  });

  it('legato: notas repetidas separadas só pela troca de arco, sem silêncio, com vibrato', () => {
    const { result } = simulateGame(game, { articulation: 'legato', vibratoCents: 15 });
    expect(result.counts.miss).toBe(0);
    expect(result.counts.perfect).toBeGreaterThanOrEqual(14);
  });

  it('parar de tocar no meio para a orquestra: game over com compasso alcançado', () => {
    const song = scaleSong(4);
    const { result, events } = simulateGame({ ...game, song }, { perNote: (n) => (n.index >= 10 ? { skip: true } : undefined) });
    expect(result.status).toBe('failed');
    expect(events.at(-1)?.type).toBe('gameover');
    expect(result.judgments.filter((j) => j.issue === 'not-played').length).toBeGreaterThan(0);
    expect(result.reachedMeasure).toBeGreaterThan(1);
    expect(result.reachedMeasure).toBeLessThan(result.totalMeasures - 1);
    expect(result.badges).toEqual([]);
  });

  it('é determinístico', () => {
    expect(simulateGame(game, { errors: 4, seed: 3 })).toEqual(simulateGame(game, { errors: 4, seed: 3 }));
  });
});

describe('renderPerformance', () => {
  it('a primeira leitura de cada nota sai no início + atraso de detecção + latência', () => {
    const notes = scheduleNotes(ODE, 1, ODE.bpm, A4);
    const { readings } = renderPerformance(notes, A4, { latencySeconds: 0.1, offsetMs: 20 });
    expect(readings[0].time).toBeCloseTo(1 + 0.02 + 0.03 + 0.1, 9);
    expect(readings.filter((r) => r.reading === null)).toHaveLength(15);
  });

  it('legato não tem silêncio até o fim', () => {
    const notes = scheduleNotes(ODE, 1, ODE.bpm, A4);
    const { readings } = renderPerformance(notes, A4, { articulation: 'legato' });
    expect(readings.slice(0, -1).every((r) => r.reading !== null)).toBe(true);
  });
});

describe('pickWrongNotes', () => {
  it('é determinístico, distinto, ordenado e limitado', () => {
    const a = pickWrongNotes(15, 3, 7);
    expect(a).toEqual(pickWrongNotes(15, 3, 7));
    expect(new Set(a).size).toBe(3);
    expect([...a].sort((x, y) => x - y)).toEqual(a);
    expect(pickWrongNotes(4, 10)).toEqual([0, 1, 2, 3]);
  });
});

describe('parseSimulate', () => {
  it.each([
    ['?simular=0', { offsetMs: 0, errors: 0 }],
    ['?simular=-120,5&erros=3', { offsetMs: -120.5, errors: 3 }],
    ['?simular=80&erros=', { offsetMs: 80, errors: 0 }],
  ])('%s', (search, expected) => {
    expect(parseSimulate(search)).toEqual(expected);
  });

  it.each(['', '?simular=', '?simular=abc', '?simular=1001', '?simular=0&erros=-1', '?simular=0&erros=1.5'])(
    '%s é inválido',
    (search) => {
      expect(parseSimulate(search)).toBeNull();
    },
  );
});
