import { describe, expect, it } from 'vitest';
import {
  beatAt,
  beatWindows,
  beatX,
  markApplies,
  noteAlpha,
  PASSED_ALPHA,
  sheetLayout,
  steadyClock,
  stepY,
  windowTime,
  type BeatSegment,
  type BeatWindow,
} from './sheetLayout';

const seg = (time: number, beat: number, spb: number, endTime = Infinity, endBeat = Infinity): BeatSegment => ({ time, beat, spb, endTime, endBeat });

function windows(segments: BeatSegment[], now: number, behind: number, ahead: number) {
  const out: BeatWindow[] = [];
  const count = beatWindows(segments, now, behind, ahead, out);
  return out.slice(0, count).map((w) => ({ from: w.fromBeat, to: w.toBeat, shift: w.shift }));
}

describe('relógio de tempos', () => {
  it('andamento fixo: o tempo da música pelo instante, contando a entrada para trás', () => {
    const clock = steadyClock(10, 120);
    expect(beatAt(clock.segments(20), 10)).toBe(0);
    expect(beatAt(clock.segments(20), 12)).toBe(4);
    expect(beatAt(clock.segments(20), 9)).toBe(-2);
    expect(() => steadyClock(0, 0)).toThrow();
  });

  it('um pedaço só sem prática: notas a (tempo − agora) da agulha', () => {
    expect(windows(steadyClock(10, 60).segments(30), 14, 2, 6)).toEqual([{ from: 2, to: 10, shift: -4 }]);
  });

  it('laço A–B: depois do fim de B, A aparece colado à frente da agulha', () => {
    // compassos de 4 tempos a 1 s; laço dos compassos 1–2 (tempos 4 a 12), salto às 22 s
    const segments = [seg(10, 0, 1, 22, 12), seg(22, 4, 1, 30, 12), seg(30, 4, 1)];
    expect(windows(segments, 20, 2, 6)).toEqual([
      { from: 8, to: 12, shift: -10 },
      { from: 4, to: 8, shift: -2 },
    ]);
    // logo depois do salto: o fim de B ainda atrás, A sob a agulha
    expect(windows(segments, 22.5, 2, 3)).toEqual([
      { from: 10.5, to: 12, shift: -12.5 },
      { from: 4, to: 7.5, shift: -4.5 },
    ]);
  });

  it('troca de andamento: espaço por tempo igual, só o relógio anda mais devagar', () => {
    const segments = [seg(0, 0, 0.5, 4, 8), seg(4, 8, 1)];
    expect(beatAt(segments, 6)).toBe(10);
    expect(windows(segments, 3, 4, 6)).toEqual([
      { from: 2, to: 8, shift: -6 },
      { from: 8, to: 12, shift: -6 },
    ]);
  });

  it('instante de cada cópia da nota, para prender o julgamento à volta certa', () => {
    const segments = [seg(10, 0, 1, 22, 12), seg(22, 4, 1)];
    const out: BeatWindow[] = [];
    beatWindows(segments, 21, 4, 4, out);
    expect(windowTime(out[0], 10)).toBe(20);
    expect(windowTime(out[1], 4)).toBe(22);
    expect(markApplies(22.2, 22)).toBe(true);
    expect(markApplies(14, 22)).toBe(false);
  });

  it('reaproveita o vetor de saída entre quadros', () => {
    const out: BeatWindow[] = [];
    const segments = steadyClock(0, 60).segments(10);
    beatWindows(segments, 1, 1, 1, out);
    const first = out[0];
    beatWindows(segments, 2, 1, 1, out);
    expect(out[0]).toBe(first);
  });
});

describe('medidas da faixa', () => {
  it('tela 5b: espaço de 18 px, agulha depois da clave, 100 px por tempo', () => {
    const l = sheetLayout(1198, 280, 2);
    expect(l.compact).toBe(false);
    expect(l.space).toBe(18);
    expect(l.pxPerBeat).toBeCloseTo(100.8, 1);
    expect(l.clefWidth).toBeCloseTo(160, -1);
    expect(l.needleX).toBeGreaterThan(l.clefWidth);
    expect(stepY(l, 30) - stepY(l, 38)).toBe(72);
    expect(l.nameY).toBeLessThan(280);
  });

  it('faixa compacta: espaço de 10 px, sem nome da nota, tudo dentro da altura', () => {
    const l = sheetLayout(1200, 112, 2);
    expect(l.compact).toBe(true);
    expect(l.space).toBe(10);
    expect(l.fingerY + l.fingerSize / 2).toBeLessThanOrEqual(112);
    expect(stepY(l, 30)).toBeCloseTo(l.middleY + 20);
  });

  it('mais acidentes na armadura empurram a agulha; tempos visíveis cobrem a largura', () => {
    const two = sheetLayout(1000, 280, 2);
    const four = sheetLayout(1000, 280, 4);
    expect(four.clefWidth).toBeGreaterThan(two.clefWidth);
    expect(beatX(two, two.ahead)).toBeGreaterThan(1000);
    expect(beatX(two, -two.behind)).toBeLessThan(two.clefWidth);
  });

  it('nota passada apaga, a não ser que tenha sido acertada', () => {
    expect(noteAlpha(-1.5, 1, false)).toBe(PASSED_ALPHA);
    expect(noteAlpha(-1.5, 1, true)).toBe(1);
    expect(noteAlpha(-0.5, 1, false)).toBe(1);
  });
});
