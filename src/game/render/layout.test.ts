import { describe, expect, it } from 'vitest';
import {
  depthScale,
  entryAlpha,
  LEAD_SECONDS,
  lowerBound,
  maxNotesInWindow,
  noteDepth,
  projectX,
  projectY,
  stageBox,
  tailSeconds,
  trackLayout,
} from './layout';

describe('stageBox', () => {
  it('1280×720: 640×550 centralizada, como o design', () => {
    expect(stageBox(1280, 720)).toEqual({ x: 320, y: 0, width: 640, height: 550 });
  });

  it('844×390: 440×272 centralizada, como o design do celular', () => {
    expect(stageBox(844, 390)).toEqual({ x: 202, y: 0, width: 440, height: 272 });
  });

  it('celular em pé: cabe com a margem lateral', () => {
    const b = stageBox(360, 740);
    expect(b.x).toBeGreaterThanOrEqual(16);
    expect(b.x + b.width).toBeLessThanOrEqual(344);
  });
});

const boxes = [
  [640, 550],
  [440, 272],
  [328, 565],
  [800, 600],
] as const;

describe('trackLayout com a descida do nível', () => {
  it('a nota leva `lead` segundos do topo à linha', () => {
    for (const lead of [1.75, 3]) {
      const l = trackLayout(640, 550, lead);
      expect(noteDepth(l, lead, 0)).toBeCloseTo(l.enterDepth, 6);
    }
    expect(trackLayout(640, 550).lead).toBe(LEAD_SECONDS);
  });
});

describe.each(boxes)('trackLayout %ix%i', (w, h) => {
  const l = trackLayout(w, h);

  it('linha de acerto e letras das cordas dentro da caixa, letras abaixo da linha', () => {
    const hitY = projectY(l, l.hitDepth);
    const letterY = projectY(l, l.letterDepth);
    expect(hitY).toBeGreaterThan(h * 0.5);
    expect(letterY).toBeGreaterThan(hitY + l.targetRadius * depthScale(l, l.hitDepth));
    expect(letterY + (l.letterSize * depthScale(l, l.letterDepth)) / 2).toBeLessThan(h);
  });

  it('trilhas G D A E da esquerda para a direita, dentro da caixa e simétricas', () => {
    const xs = l.lanes.map((x) => projectX(l, x, l.hitDepth));
    for (let i = 1; i < 4; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    const halfPlane = (l.planeWidth / 2) * depthScale(l, 0);
    expect(l.originX - halfPlane).toBeGreaterThanOrEqual(0);
    expect(l.originX + halfPlane).toBeLessThanOrEqual(w);
    expect(xs[0] + xs[3]).toBeCloseTo(w);
  });

  it('o plano cruza o topo da caixa na profundidade máxima', () => {
    expect(projectY(l, l.farDepth)).toBeCloseTo(0, 6);
  });

  it('a nota entra inteira, abaixo do topo', () => {
    expect(projectY(l, l.enterDepth + l.note.height / 2)).toBeGreaterThan(0);
  });

  it('nota e alvo cabem na trilha', () => {
    expect(l.note.width).toBeLessThan(l.laneWidth);
    expect(l.targetRadius * 2).toBeLessThan(l.laneWidth);
  });

  it('feedback do julgamento acima da linha de acerto', () => {
    expect(l.feedback.y + l.feedback.size).toBeLessThan(projectY(l, l.hitDepth));
  });
});

describe('lugar do feedback', () => {
  it('desktop 640×550: centralizado acima da linha de acerto', () => {
    expect(trackLayout(640, 550).feedback).toMatchObject({ align: 'center', x: 320 });
  });

  it('celular 440×272: no canto direito, fora do plano onde as notas descem', () => {
    const l = trackLayout(440, 272);
    expect(l.feedback.align).toBe('right');
    expect(l.feedback.x).toBeLessThanOrEqual(440);
    // "Perfeito!" tem ~4,2× a altura de largura: precisa caber entre a borda do plano e a da caixa
    const bottom = l.feedback.y + l.feedback.size * 1.6;
    let d = 0;
    while (projectY(l, d) > bottom) d += 1;
    const planeEdge = projectX(l, l.planeWidth / 2, d);
    expect(l.feedback.x - l.feedback.size * 4.2).toBeGreaterThanOrEqual(planeEdge - 1);
  });
});

describe('perspectiva', () => {
  const l = trackLayout(640, 550);

  it('mais longe é mais alto e menor', () => {
    expect(projectY(l, 600)).toBeLessThan(projectY(l, 300));
    expect(depthScale(l, 600)).toBeLessThan(depthScale(l, 300));
    expect(depthScale(l, 0)).toBe(1);
  });

  it('é a projeção do CSS do design: rotateX 58°, perspective 880, origem 50% 8%', () => {
    expect(l.perspective).toBeCloseTo(880);
    expect(l.originY).toBeCloseTo(44);
    expect(l.planeWidth).toBeCloseTo(499.2);
    expect(projectY(l, 0)).toBeCloseTo(610.5);
  });
});

describe('posição da nota no tempo', () => {
  const l = trackLayout(640, 550);

  it('está na linha de acerto exatamente na hora', () => {
    expect(noteDepth(l, 12.5, 12.5)).toBeCloseTo(l.hitDepth);
  });

  it('entra no topo LEAD_SECONDS antes', () => {
    expect(noteDepth(l, 10, 10 - LEAD_SECONDS)).toBeCloseTo(l.enterDepth);
  });

  it('continua descendo depois da hora', () => {
    expect(projectY(l, noteDepth(l, 10, 10.1))).toBeGreaterThan(projectY(l, l.hitDepth));
  });

  it('depende só do relógio, não de quantos quadros rodaram', () => {
    expect(noteDepth(l, 5, 4.25)).toBeCloseTo(l.hitDepth + 0.75 * l.speed);
  });

  it('aparece transparente e fica opaca ao descer a própria altura', () => {
    expect(entryAlpha(l, l.enterDepth)).toBe(0);
    expect(entryAlpha(l, l.enterDepth - l.note.height / 2)).toBeCloseTo(0.5);
    expect(entryAlpha(l, l.hitDepth)).toBe(1);
  });
});

describe('tailSeconds', () => {
  it('nota curta não tem cauda; longa tem, com uma folga antes da próxima', () => {
    expect(tailSeconds(0.4)).toBe(0);
    expect(tailSeconds(1.5)).toBeGreaterThan(1.3);
    expect(tailSeconds(1.5)).toBeLessThan(1.5);
  });
});

describe('lowerBound', () => {
  const times = [0, 0.5, 0.5, 1, 2];

  it.each([
    [-1, 0],
    [0, 0],
    [0.25, 1],
    [0.5, 1],
    [1.5, 4],
    [3, 5],
  ])('primeiro tempo ≥ %f está em %i', (t, i) => {
    expect(lowerBound(times, t)).toBe(i);
  });

  it('vetor vazio', () => {
    expect(lowerBound([], 1)).toBe(0);
  });
});

describe('maxNotesInWindow', () => {
  it('conta o trecho mais denso', () => {
    expect(maxNotesInWindow([0, 0.1, 0.2, 1, 3, 3.1], 0.5)).toBe(3);
    expect(maxNotesInWindow([0, 1, 2, 3], 2)).toBe(3);
    expect(maxNotesInWindow([], 2)).toBe(0);
  });
});
