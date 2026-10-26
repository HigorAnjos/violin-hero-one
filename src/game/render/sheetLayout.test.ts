import { describe, expect, it } from 'vitest';
import { FIXED_SONGS } from '../notation/songs';
import { keySignature, staffLayout } from './staff';
import {
  barOffsets,
  BEAT_SPACES,
  beatWarp,
  clefFade,
  dashedCubic,
  IDENTITY_WARP,
  loopMarks,
  MIN_TEXT_PX,
  MIN_GAP_BEATS,
  MIN_GAP_SPACES,
  beatAt,
  beatWindows,
  beatX,
  markApplies,
  noteAlpha,
  PASSED_ALPHA,
  sheetLayout,
  steadyClock,
  stepY,
  tieArc,
  tieShows,
  windowTime,
  type BeatSegment,
  type BeatWindow,
} from './sheetLayout';

const seg = (time: number, beat: number, spb: number, endTime = Infinity, endBeat = Infinity): BeatSegment => ({ time, beat, spb, endTime, endBeat });

function windows(segments: readonly BeatSegment[], now: number, behind: number, ahead: number) {
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

  it('passada contínua: o salto do laço corta, a troca de andamento não', () => {
    const loop = [seg(10, 0, 1, 22, 12), seg(22, 4, 1, 30, 12), seg(30, 4, 1)];
    const out: BeatWindow[] = [];
    const count = beatWindows(loop, 21, 2, 6, out);
    expect(out.slice(0, count).map((w) => [w.passFrom, w.passTo])).toEqual([
      [0, 12],
      [4, 12],
    ]);
    const tempo = [seg(0, 0, 0.5, 4, 8), seg(4, 8, 1)];
    beatWindows(tempo, 3, 4, 6, out);
    expect([out[0].passFrom, out[0].passTo, out[1].passFrom, out[1].passTo]).toEqual([0, Infinity, 0, Infinity]);
  });

  it('ligadura: na mesma passada, uma vez só; no salto do laço B não se liga a A', () => {
    // laço dos tempos 4 a 12, salto às 22 s; agulha no tempo 11 da 1ª volta
    const loop = [seg(10, 0, 1, 22, 12), seg(22, 4, 1, 30, 12), seg(30, 4, 1)];
    const out: BeatWindow[] = [];
    beatWindows(loop, 21, 4, 6, out);
    const [b, a] = out;
    // dentro de B e atravessando a barra do tempo 8
    expect(tieShows(b, undefined, 9, 10)).toBe(true);
    expect(tieShows(b, undefined, 7, 9)).toBe(true);
    // a última nota de B (tempo 11) ligada a uma que viria no tempo 12: fora da passada
    expect(tieShows(b, undefined, 11, 12)).toBe(false);
    // a primeira de A ligada a uma de antes de A: fora da passada
    expect(tieShows(a, b, 3, 4)).toBe(false);
    expect(tieShows(a, b, 4, 5)).toBe(true);
    // troca de andamento no tempo 8: o arco de 7 a 9 sai no primeiro pedaço e não repete no segundo
    const tempo = [seg(0, 0, 0.5, 4, 8), seg(4, 8, 1)];
    beatWindows(tempo, 3.5, 4, 6, out);
    expect(tieShows(out[0], undefined, 7, 9)).toBe(true);
    expect(tieShows(out[1], out[0], 7, 9)).toBe(false);
    expect(tieShows(out[1], out[0], 9, 10)).toBe(true);
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

describe('marcadores do laço', () => {
  it('bandeirinha com texto de 12 px ou mais; o arco fica acima da pauta e some na faixa compacta', () => {
    for (const [w, h] of [
      [1198, 280],
      [810, 184],
      [810, 112],
    ]) {
      const l = sheetLayout(w, h, 2);
      const m = loopMarks(l);
      expect(m.labelSize).toBeGreaterThanOrEqual(MIN_TEXT_PX);
      expect(m.flagTop).toBeGreaterThanOrEqual(0);
      expect(m.lineBottom).toBeLessThanOrEqual(h);
      if (l.compact) expect(m.arc).toBeNull();
      else {
        expect(m.arc!.topY).toBeGreaterThanOrEqual(0);
        expect(m.arc!.baseY).toBeLessThan(stepY(l, 38));
      }
    }
    // Design (espaço 18): bandeirinha a 20 px do topo, 22 px de altura, arco de 56 a 10 px
    const m = loopMarks(sheetLayout(1198, 280, 2));
    const near = (value: number, design: number) => expect(Math.abs(value - design)).toBeLessThan(1.5);
    near(m.flagTop, 20);
    near(m.flagHeight, 22);
    near(m.arc!.baseY, 56);
    near(m.arc!.topY, 10);
  });

  it('arco tracejado: traços do tamanho pedido, ao longo da curva, das duas pontas', () => {
    const pieces = dashedCubic([0, 0, 0, 0, 100, 0, 100, 0], 6, 6);
    const length = (p: number[]) => p.reduce((sum, _, i) => (i >= 2 && i % 2 === 0 ? sum + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]) : sum), 0);
    expect(pieces.length).toBeGreaterThanOrEqual(8);
    for (const p of pieces.slice(0, -1)) expect(length(p)).toBeCloseTo(6, 6);
    expect(pieces[0].slice(0, 2)).toEqual([0, 0]);
    expect(pieces.at(-1)!.at(-2)).toBeCloseTo(100, 6);
  });
});

describe('vão mínimo entre ataques (BeatWarp)', () => {
  // Semínima, duas semicolcheias, colcheia, pausa de colcheia, semínima
  const warp = beatWarp([0, 1, 1.25, 1.5, 2, 2.5, 3, 1]);

  it('vão de colcheia ou maior fica como está; o curto cresce até o mínimo', () => {
    expect(MIN_GAP_BEATS).toBeCloseTo(MIN_GAP_SPACES / BEAT_SPACES);
    expect(MIN_GAP_BEATS).toBeGreaterThan(0.25);
    expect(MIN_GAP_BEATS).toBeLessThanOrEqual(0.55);
    const at = [0, 1, 1.25, 1.5, 2, 2.5, 3].map(warp.forward);
    const gaps = at.slice(1).map((x, i) => x - at[i]);
    expect(gaps[0]).toBeCloseTo(1);
    expect(gaps[1]).toBeCloseTo(MIN_GAP_BEATS);
    expect(gaps[2]).toBeCloseTo(MIN_GAP_BEATS);
    expect(gaps.every((g) => g >= MIN_GAP_BEATS - 1e-9)).toBe(true);
    // Antes e depois das notas, inclinação 1 (a entrada e o fim)
    expect(warp.forward(-2)).toBeCloseTo(-2);
    expect(warp.forward(5) - warp.forward(3)).toBeCloseTo(2);
    expect(warp.forward(Infinity)).toBe(Infinity);
  });

  it('crescente, contínua e com inversa', () => {
    let last = -Infinity;
    for (let b = -1; b <= 4; b += 0.01) {
      const x = warp.forward(b);
      expect(x).toBeGreaterThan(last);
      expect(warp.inverse(x)).toBeCloseTo(b, 9);
      last = x;
    }
    expect(beatWarp([2])).toBe(IDENTITY_WARP);
  });

  it('os pedaços medem a distância em tempos de faixa: a nota passa na agulha na hora dela', () => {
    const out: BeatWindow[] = [];
    const segments = steadyClock(0, 60).segments(10);
    // 1,25 s: a 2ª semicolcheia sob a agulha
    beatWindows(segments, 1.25, 2, 4, out, warp);
    expect(warp.forward(1.25) + out[0].shift).toBeCloseTo(0);
    expect(warp.forward(1.5) + out[0].shift).toBeCloseTo(MIN_GAP_BEATS);
    // O fim do pedaço é o tempo da música a `ahead` tempos de faixa
    expect(warp.forward(out[0].toBeat) + out[0].shift).toBeCloseTo(4);
    // Laço de 0 a 3 em volta: o começo de A vem colado no fim de B, também em tempos de faixa
    const loop = [seg(0, 0, 1, 3, 3), seg(3, 0, 1, 6, 3)];
    const count = beatWindows(loop, 2.5, 1, 4, out, warp);
    expect(count).toBe(2);
    expect(warp.forward(3) + out[0].shift).toBeCloseTo(warp.forward(3) - warp.forward(2.5));
    expect(warp.forward(0) + out[1].shift).toBeCloseTo(warp.forward(3) - warp.forward(2.5));
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

  it('barra meio tempo antes do compasso, ou no meio do vão quando a nota anterior está mais perto', () => {
    expect(Array.from(barOffsets([0, 4, 8], [0, 1, 2, 3, 4, 5, 6, 7.5, 8]))).toEqual([0.5, 0.5, 0.25]);
    expect(Array.from(barOffsets([0, 4], [0, 3.75, 4]))).toEqual([0.5, 0.125]);
  });

  it.each([
    ['tela 5b', 1198, 280],
    ['faixa compacta', 764, 112],
  ])('%s: nenhuma cabeça, haste nem pausa encosta na barra de compasso, em nenhuma música fixa', (_name, width, height) => {
    for (const { song } of FIXED_SONGS) {
      const staff = staffLayout(song);
      const l = sheetLayout(width, height, keySignature(staff.fifths).length);
      const starts = [...staff.notes, ...staff.rests].map((x) => x.at).sort((a, b) => a - b);
      const offsets = barOffsets(staff.bars, starts);
      const gaps: number[] = [];
      staff.bars.forEach((start, m) => {
        if (m === 0) return;
        const bar = (start - offsets[m]) * l.pxPerBeat;
        for (const r of staff.rests) gaps.push(Math.abs(r.at * l.pxPerBeat - bar) - l.head.rx);
        for (const n of staff.notes) {
          const x = n.at * l.pxPerBeat - bar;
          const stem = x + (n.stemUp ? 1 : -1) * l.head.rx * 0.9;
          gaps.push(Math.abs(x) - l.head.rx);
          if (n.stem) gaps.push(Math.abs(stem));
        }
      });
      expect(Math.min(...gaps), song.id).toBeGreaterThanOrEqual(l.space * 0.5);
    }
  });

  it('arco da ligadura: entre as cabeças, do lado contrário à haste, depois do ponto, mais alto quando mais longo', () => {
    const l = sheetLayout(1198, 280, 2);
    const out = { x: 0, y: 0, width: 0, height: 0 };
    const short = { ...tieArc(l, 300, 300 + l.pxPerBeat, { step: 33, below: true, dotted: false }, out) };
    expect(short.x).toBeGreaterThan(300);
    expect(short.x + short.width).toBeLessThan(300 + l.pxPerBeat);
    expect(short.y).toBeGreaterThan(stepY(l, 33));
    expect(short.height).toBeGreaterThan(0);
    const above = { ...tieArc(l, 300, 300 + l.pxPerBeat, { step: 40, below: false, dotted: false }, out) };
    expect(above.y).toBeLessThan(stepY(l, 40));
    expect(above.height).toBeLessThan(0);
    const dotted = tieArc(l, 300, 300 + 1.5 * l.pxPerBeat, { step: 33, below: true, dotted: true }, out);
    expect(dotted.x).toBeGreaterThan(300 + l.head.rx + l.space * 0.7);
    const long = tieArc(l, 300, 300 + 4 * l.pxPerBeat, { step: 33, below: true, dotted: false }, out);
    expect(long.height).toBeGreaterThan(short.height);
    expect(long.height).toBeLessThanOrEqual(l.space * 1.1);
  });

  it('a nota apaga ao entrar sob a clave, e não antes', () => {
    const l = sheetLayout(1198, 280, 2);
    expect(clefFade(l, l.needleX)).toBe(1);
    expect(clefFade(l, l.clefWidth + l.head.rx)).toBe(0);
    expect(clefFade(l, l.clefWidth + l.head.rx + l.space * 0.75)).toBeCloseTo(0.5);
  });

  it('nota passada apaga, a não ser que tenha sido acertada', () => {
    expect(noteAlpha(-1.5, 1, false)).toBe(PASSED_ALPHA);
    expect(noteAlpha(-1.5, 1, true)).toBe(1);
    expect(noteAlpha(-0.5, 1, false)).toBe(1);
  });
});
