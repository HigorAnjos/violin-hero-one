import { describe, expect, it } from 'vitest';
import { hitTest, measureBox, prefixWidth, staffHeight, stepY, STAFF_WIDTH, SYSTEM_HEIGHT, xAt } from './staffGeometry';

describe('geometria da pauta do editor', () => {
  it('4 compassos por sistema, dividindo a largura que sobra depois da clave e da armadura', () => {
    expect(prefixWidth(0, 2)).toBe(104); // como o design: o compasso 1 começa em 104 em Ré maior
    const first = measureBox(0, 2);
    const fourth = measureBox(3, 2);
    expect(first).toEqual({ system: 0, x: 104, width: (STAFF_WIDTH - 104) / 4 });
    expect(fourth.x + fourth.width).toBeCloseTo(STAFF_WIDTH);
    expect(measureBox(4, 2)).toMatchObject({ system: 1, x: prefixWidth(1, 2) });
    expect(staffHeight(5)).toBe(2 * SYSTEM_HEIGHT);
  });

  it('linha de baixo (Mi4) em 92 e de cima (Fá5) em 44, no primeiro sistema', () => {
    expect(stepY(30, 0)).toBe(92);
    expect(stepY(38, 0)).toBe(44);
    expect(stepY(30, 1)).toBe(92 + SYSTEM_HEIGHT);
  });

  it('o tempo anda proporcional dentro do compasso e a barra é o começo do seguinte', () => {
    const a = xAt(0, 4, 2).x;
    const b = xAt(1, 4, 2).x;
    const c = xAt(2, 4, 2).x;
    expect(b - a).toBeCloseTo(c - b);
    expect(xAt(4, 4, 2)).toEqual({ x: measureBox(1, 2).x + 18, system: 0 });
    expect(xAt(16, 4, 2).system).toBe(1);
  });

  it('o toque volta ao tempo e ao grau de onde a nota foi desenhada', () => {
    for (const at of [0, 1, 2.5, 7, 13]) {
      for (const step of [25, 30, 34, 41, 44]) {
        const { x, system } = xAt(at, 4, 2);
        const hit = hitTest(x, stepY(step, system), 8, 4, 2);
        expect(hit.step).toBe(step);
        expect(Math.floor(hit.at * 2) / 2).toBeCloseTo(at);
      }
    }
  });

  it('toque fora da pauta fica dentro do violino e dos compassos que existem', () => {
    expect(hitTest(-50, -400, 4, 4, 0)).toEqual({ at: 0, step: 44 });
    const far = hitTest(9999, 9999, 4, 4, 0);
    expect(far.step).toBe(25);
    expect(far.at).toBeLessThan(16);
    expect(far.at).toBeGreaterThan(15);
  });
});
