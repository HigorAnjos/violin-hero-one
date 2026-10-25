import { describe, expect, it } from 'vitest';
import type { PitchReading } from '../audio/types';
import { midiToFrequency } from '../notation/violin';
import { DETECTION_LAG_SECONDS, createJudge, type JudgeOptions, type Verdict } from './judge';
import { engineNote as note, reading } from './testing';
import type { EngineNote } from './types';

function held(from: number, to: number, midi: number, level: (t: number) => number = () => -12): PitchReading[] {
  const out: PitchReading[] = [];
  for (let t = from; t < to - 1e-9; t += 0.01) out.push(reading(t, midi, 0, level(t)));
  return out;
}

/** Leituras a cada 10 ms de um ataque ouvido `offsetMs` depois de `noteTime`, sustentado por `holdSec`. */
function attack(noteTime: number, offsetMs: number, midi: number, holdSec = 0.3, cents = 0, latency = 0) {
  const first = noteTime + offsetMs / 1000 + DETECTION_LAG_SECONDS + latency;
  const out: PitchReading[] = [];
  for (let t = 0; t <= holdSec + 1e-9; t += 0.01) out.push(reading(first + t, midi, cents));
  return out;
}

function setup(notes: EngineNote[], options: JudgeOptions = {}) {
  const verdicts: Verdict[] = [];
  const judge = createJudge(notes, options, (v) => verdicts.push(v));
  const feed = (readings: (PitchReading | null)[]) => readings.forEach((r) => judge.push(r));
  const kinds = () => verdicts.map((v) => v.kind);
  return { judge, verdicts, feed, kinds };
}

describe('janelas de tempo', () => {
  it.each([0, 65, -65, 100, -125, 180, -215])('ataque a %s ms acerta com esse desvio', (offset) => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed(attack(1, offset, 66));
    judge.advance(3);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ kind: 'hit', index: 0 });
    expect((verdicts[0] as { offsetMs: number }).offsetMs).toBeCloseTo(offset, 6);
  });

  it('ataque além da janela Bom erra, e o erro diz que foi atrasado', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed(attack(1, 260, 66));
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'miss', attempt: { kind: 'timing', offsetMs: expect.closeTo(260, 6) } });
  });

  it('ataque adiantado demais também erra, e diz que foi cedo', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed([...attack(1, -300, 66, 0.05), null]);
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'miss', attempt: { kind: 'timing', offsetMs: expect.closeTo(-300, 6) } });
  });

  it('nota nunca tocada erra quando a janela fecha, sem tentativa', () => {
    const { judge, verdicts } = setup([note(0, 1, 66)]);
    judge.advance(1.2);
    expect(verdicts).toHaveLength(0);
    judge.advance(1.4);
    expect(verdicts[0]).toEqual({ kind: 'miss', index: 0, attempt: null });
    expect(judge.done).toBe(true);
  });

  it('mantém a nota aberta 100 ms além da janela para leituras atrasadas pela thread principal', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    judge.advance(1 + 0.22 + DETECTION_LAG_SECONDS + 0.09);
    feed(attack(1, 215, 66));
    expect(verdicts[0]).toMatchObject({ kind: 'hit' });

    const late = setup([note(0, 1, 66)]);
    late.judge.advance(1 + 0.22 + DETECTION_LAG_SECONDS + 0.11);
    expect(late.verdicts[0]).toMatchObject({ kind: 'miss' });
  });
});

describe('altura', () => {
  it('nota errada não acerta e o erro guarda a nota tocada', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed(attack(1, 0, 68));
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'miss', attempt: { kind: 'wrong', playedMidi: 68 } });
  });

  it('aceita até ±50 cents do alvo e devolve o desvio', () => {
    for (const cents of [-45, 45]) {
      const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
      feed(attack(1, 0, 66, 0.3, cents));
      judge.advance(3);
      expect(verdicts[0]).toMatchObject({ kind: 'hit', cents: expect.closeTo(cents, 6) });
    }
  });

  it('além da tolerância, mas perto do alvo, é desafinada e não nota errada', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed(attack(1, 0, 66, 0.3, 60));
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'miss', attempt: { kind: 'tuning', cents: expect.closeTo(60, 6) } });
  });

  it('compara pela frequência, não pela nota que a histerese segura', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed(attack(1, 0, 65, 0.3, 70));
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'hit' });
  });

  it('respeita uma tolerância própria', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)], { toleranceCents: 20 });
    feed(attack(1, 0, 66, 0.3, 30));
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'miss', attempt: { kind: 'tuning' } });
  });

  it('precisa de leitura estável: duas leituras soltas não são ataque', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed([...attack(1, 0, 66, 0.01), null]);
    judge.advance(3);
    expect(verdicts[0]).toEqual({ kind: 'miss', index: 0, attempt: null });
  });

  it('marca o tempo do início do som mesmo que a altura assente depois', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    feed([...attack(1, 0, 66, 0.05, 70), ...attack(1, 60, 66, 0.2, 0)]);
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'hit', offsetMs: expect.closeTo(0, 6) });
  });

  it('usa o Lá dado para os alvos', () => {
    const { judge, verdicts } = setup([{ ...note(0, 1, 66), frequency: midiToFrequency(66, 415) }]);
    const lowHz = midiToFrequency(66, 415);
    for (let i = 0; i < 10; i++) judge.push({ ...reading(1 + DETECTION_LAG_SECONDS + i * 0.01, 65), hz: lowHz });
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'hit', cents: expect.closeTo(0, 6) });
  });
});

describe('um ataque, uma nota', () => {
  it('nota sustentada não acerta a repetição', () => {
    const { judge, feed, kinds } = setup([note(0, 1, 66), note(1, 1.5, 66)]);
    feed(attack(1, 0, 66, 0.9));
    judge.advance(3);
    expect(kinds()).toEqual(['hit', 'miss']);
  });

  it('repetição acerta depois de um ataque novo (null entre os dois)', () => {
    const { judge, feed, kinds } = setup([note(0, 1, 66), note(1, 1.5, 66)]);
    feed([...attack(1, 0, 66, 0.4), null, ...attack(1.5, 20, 66, 0.4)]);
    judge.advance(3);
    expect(kinds()).toEqual(['hit', 'hit']);
  });

  it('ataque em duas janelas vai para a nota aberta mais antiga: quem atrasa continua no passo', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66), note(1, 1.333, 66)]);
    feed([...attack(1, 180, 66, 0.1), null, ...attack(1.333, 180, 66, 0.2)]);
    judge.advance(3);
    expect(verdicts.map((v) => v.kind === 'hit' && Math.round(v.offsetMs))).toEqual([180, 180]);
  });

  it('acertar uma nota adiante erra antes as anteriores em aberto', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66), note(1, 1.333, 67)]);
    feed(attack(1.333, -150, 67));
    expect(verdicts.map((v) => [v.index, v.kind])).toEqual([
      [0, 'miss'],
      [1, 'hit'],
    ]);
    judge.advance(3);
    expect(verdicts).toHaveLength(2);
  });
});

describe('trocas de arco e falhas de clareza', () => {
  const dipAt = (from: number, to: number, depth: number) => (t: number) => (t >= from && t < to ? -12 - depth : -12);

  it('queda de nível e volta, mesma altura, é ataque novo marcado na subida', () => {
    const { judge, verdicts, feed, kinds } = setup([note(0, 1, 66), note(1, 1.667, 66)]);
    feed(held(1 + DETECTION_LAG_SECONDS, 2.2, 66, dipAt(1.627, 1.667, 6)));
    judge.advance(3);
    expect(kinds()).toEqual(['hit', 'hit']);
    expect((verdicts[1] as { offsetMs: number }).offsetMs).toBeCloseTo(-2, 0);
  });

  it('tremor lento de ±3 dB não é ataque', () => {
    const { judge, feed, kinds } = setup([note(0, 1, 66), note(1, 1.667, 66)]);
    feed(held(1 + DETECTION_LAG_SECONDS, 2.4, 66, (t) => -12 + 3 * Math.sin(2 * Math.PI * 7 * t)));
    judge.advance(3);
    expect(kinds()).toEqual(['hit', 'miss']);
  });

  it('falha de clareza menor que 60 ms no meio de uma nota não é ataque', () => {
    const { judge, feed, kinds } = setup([note(0, 1, 66), note(1, 1.667, 66)]);
    feed([...held(1 + DETECTION_LAG_SECONDS, 1.6, 66), null, ...held(1.65, 2.2, 66)]);
    judge.advance(3);
    expect(kinds()).toEqual(['hit', 'miss']);
  });

  it('salto de duas leituras para a vizinha não é troca de nota nem ataque', () => {
    const { judge, feed, kinds } = setup([note(0, 1, 66), note(1, 1.667, 66)]);
    feed([...held(1 + DETECTION_LAG_SECONDS, 1.65, 66), ...held(1.65, 1.67, 65), ...held(1.67, 2.2, 66)]);
    judge.advance(3);
    expect(kinds()).toEqual(['hit', 'miss']);
  });
});

describe('latência e afinação sustentada', () => {
  it('desconta a latência calibrada de PitchReading.time', () => {
    const latency = 0.12;
    const withLatency = setup([note(0, 1, 66)], { latencySeconds: latency });
    withLatency.feed(attack(1, 0, 66, 0.3, 0, latency));
    withLatency.judge.advance(3);
    expect(withLatency.verdicts[0]).toMatchObject({ kind: 'hit', offsetMs: expect.closeTo(0, 6) });

    const without = setup([note(0, 1, 66)]);
    without.feed(attack(1, 0, 66, 0.3, 0, latency));
    without.judge.advance(3);
    expect(without.verdicts[0]).toMatchObject({ kind: 'hit', offsetMs: expect.closeTo(120, 6) });
  });

  it('a afinação do acerto é a média do som sustentado desde a leitura que acertou', () => {
    const { judge, feed } = setup([note(0, 1, 66), note(1, 3, 69)]);
    feed([...attack(1, 0, 66, 0.1, 10), ...attack(1, 110, 66, 0.1, -10)]);
    expect(judge.heldCents(0)).toBeCloseTo((9 * 10 - 11 * 10) / 20, 6);
    expect(setup([note(0, 1, 66)]).judge.heldCents(0)).toBeNull();
  });

  it('ignora leituras depois do fim', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)]);
    judge.advance(3);
    feed(attack(1, 0, 66));
    expect(verdicts).toHaveLength(1);
  });
});

describe('descarte da orquestra (sounding)', () => {
  const always = (...midis: number[]) => () => midis;

  it('leitura que bate com a orquestra e não com a nota esperada é ignorada: o erro fica sem tentativa', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)], { sounding: always(62) });
    feed(attack(1, 0, 62));
    judge.advance(3);
    expect(verdicts[0]).toEqual({ kind: 'miss', index: 0, attempt: null });
  });

  it.each([12, 19, 24])('harmônico a +%s semitons de uma nota da orquestra também é ignorado', (step) => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)], { sounding: always(50) });
    feed(attack(1, 0, 50 + step));
    judge.advance(3);
    expect(verdicts[0]).toEqual({ kind: 'miss', index: 0, attempt: null });
  });

  it('nota que a orquestra não toca segue sendo nota errada', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66)], { sounding: always(62) });
    feed(attack(1, 0, 68));
    judge.advance(3);
    expect(verdicts[0]).toMatchObject({ kind: 'miss', attempt: { kind: 'wrong', playedMidi: 68 } });
  });

  it('a nota esperada nunca é ignorada, mesmo se a orquestra tocar a mesma', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66), note(1, 2, 69)], { sounding: always(66, 69, 57) });
    feed([...attack(1, -150, 66), null, ...attack(2, 100, 69)]);
    judge.advance(4);
    expect(verdicts).toMatchObject([
      { kind: 'hit', index: 0, offsetMs: expect.closeTo(-150, 6) },
      { kind: 'hit', index: 1, offsetMs: expect.closeTo(100, 6) },
    ]);
  });

  it('a próxima nota esperada vale desde a janela Bom antes dela, mesmo com a atual ainda soando', () => {
    const { judge, verdicts, feed } = setup([note(0, 1, 66, 1), note(1, 2, 69)], { sounding: always(57) });
    feed([...attack(1, 0, 66, 0.7), ...attack(2, -200, 69)]);
    judge.advance(4);
    expect(verdicts).toMatchObject([
      { kind: 'hit', index: 0 },
      { kind: 'hit', index: 1, offsetMs: expect.closeTo(-200, 6) },
    ]);
  });

  it('pergunta à orquestra no relógio compensado: o tempo da leitura menos a latência', () => {
    const asked: number[] = [];
    const { feed } = setup([note(0, 1, 66)], {
      latencySeconds: 0.1,
      sounding: (t) => {
        asked.push(t);
        return [];
      },
    });
    feed([reading(5.13, 60)]);
    expect(asked).toEqual([expect.closeTo(5.03, 9)]);
  });

  it('sem sounding, nada muda', () => {
    const play = [...attack(1, 0, 62), null, ...attack(2, 0, 69)];
    const notes = [note(0, 1, 66), note(1, 2, 69)];
    const without = setup(notes);
    without.feed(play);
    without.judge.advance(4);
    const silent = setup(notes, { sounding: always() });
    silent.feed(play);
    silent.judge.advance(4);
    expect(without.verdicts).toMatchObject([{ kind: 'miss', attempt: { kind: 'wrong', playedMidi: 62 } }, { kind: 'hit' }]);
    expect(silent.verdicts).toEqual(without.verdicts);
  });
});
