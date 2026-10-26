import { describe, expect, it } from 'vitest';
import { stageBox, strings3dBox } from './layout';
import {
  BOX,
  boxScale,
  casaOf,
  columnsFor,
  entryAlpha3d,
  FLOOR_LENGTH,
  LETTER_HEIGHT,
  LETTER_OFFSET,
  MIN_COLUMNS,
  noteAnchor,
  noteZ,
  NUMBER_HEIGHT,
  NUMBER_Z,
  project,
  projectInto,
  STRING_HEIGHTS,
  strings3dLayout,
} from './strings3dLayout';

const VIEWPORTS = [
  [1280, 720],
  [844, 390],
] as const;

describe('caixa das Cordas 3D na tela', () => {
  it('1280×720: a largura toda acima da partitura, como no design', () => {
    expect(strings3dBox(1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 550 });
  });

  it('844×390 (celular deitado): entre os cartões compactos, como a pista', () => {
    expect(strings3dBox(844, 390)).toEqual(stageBox(844, 390));
    expect(strings3dBox(844, 390)).toEqual({ x: 202, y: 0, width: 440, height: 272 });
  });
});

describe('casa e colunas', () => {
  it('casa é o semitom acima da corda solta', () => {
    expect(casaOf({ midi: 69, string: 2 })).toBe(0);
    expect(casaOf({ midi: 74, string: 2 })).toBe(5);
    expect(casaOf({ midi: 55, string: 0 })).toBe(0);
    expect(casaOf({ midi: 88, string: 3 })).toBe(12);
  });

  it('pelo menos as casas 0 a 9; mais quando a música sobe', () => {
    expect(columnsFor([])).toBe(MIN_COLUMNS);
    expect(columnsFor([{ midi: 74, string: 2 }])).toBe(10);
    expect(columnsFor([{ midi: 81, string: 2 }])).toBe(13);
  });
});

describe('posição da nota no tempo', () => {
  const l = strings3dLayout(1280, 550, 10, 2);

  it('entra no fundo do chão `lead` segundos antes e encosta na corda na hora', () => {
    expect(noteZ(l, 12, 10)).toBeCloseTo(-FLOOR_LENGTH);
    expect(noteZ(l, 11, 10)).toBeCloseTo(-FLOOR_LENGTH / 2);
    expect(noteZ(l, 10, 10)).toBe(0);
  });

  it('depois da hora fica na corda, esperando o julgamento', () => {
    expect(noteZ(l, 9.5, 10)).toBe(0);
  });

  it('nível com descida mais lenta: mesma distância em mais tempo', () => {
    const slow = strings3dLayout(1280, 550, 10, 3);
    expect(noteZ(slow, 13, 10)).toBeCloseTo(-FLOOR_LENGTH);
    expect(slow.speed).toBeCloseTo(FLOOR_LENGTH / 3);
  });

  it('aparece transparente no fundo e fica opaca logo depois', () => {
    expect(entryAlpha3d(-FLOOR_LENGTH)).toBe(0);
    expect(entryAlpha3d(-FLOOR_LENGTH * 0.96)).toBeCloseTo(0.5);
    expect(entryAlpha3d(-FLOOR_LENGTH / 2)).toBe(1);
  });

  it('a caixa cresce no fundo para continuar legível', () => {
    expect(boxScale(0)).toBe(1);
    expect(boxScale(-FLOOR_LENGTH)).toBeCloseTo(1 + BOX.farGrowth);
  });

  it('a nota encosta na coluna da casa, na altura da corda', () => {
    const at = noteAnchor(l, { midi: 74, string: 2 });
    expect(at.x).toBeCloseTo(l.columnX[5]);
    expect(at.y).toBe(STRING_HEIGHTS[2]);
  });

  it('em 1280×550 bate com o design (5c): corda G em y 278, chão de 228 a 1108 na linha das cordas', () => {
    expect(Math.abs(project(l, 0, STRING_HEIGHTS[0], 0).y - 278)).toBeLessThan(5);
    expect(Math.abs(project(l, 0, STRING_HEIGHTS[3], 0).y - 464)).toBeLessThan(15);
    const left = project(l, l.left, 0, 0).x;
    const right = project(l, l.right, 0, 0).x;
    expect(right - left).toBeGreaterThan(800);
    expect(right - left).toBeLessThan(900);
    expect(Math.abs(project(l, 0, 0, -FLOOR_LENGTH).y - 169)).toBeLessThan(10);
  });

  it('mais distante na tela é mais alto e menor', () => {
    const near = project(l, 0, 0, 0);
    const far = project(l, 0, 0, -FLOOR_LENGTH);
    expect(far.y).toBeLessThan(near.y);
    expect(far.scale).toBeLessThan(near.scale / 4);
  });
});

describe.each(VIEWPORTS)('layout por proporção em %i×%i', (viewportWidth, viewportHeight) => {
  const { width, height } = strings3dBox(viewportWidth, viewportHeight);
  const l = strings3dLayout(width, height);
  const p = (x: number, y: number, z: number) => project(l, x, y, z);

  it('projectInto escreve o mesmo ponto que project, sem alocar', () => {
    const out = { x: 0, y: 0, scale: 0 };
    for (const [x, y, z] of [
      [l.left, 0, 0],
      [l.right, STRING_HEIGHTS[0], 0],
      [0, 1, -FLOOR_LENGTH / 3],
    ] as const) {
      expect(projectInto(l, x, y, z, out)).toBe(out);
      expect(out).toEqual(p(x, y, z));
    }
  });

  it('o fundo fica no alto (sob os cartões) e os números das casas no pé da caixa', () => {
    const farTop = p(0, STRING_HEIGHTS[0] + BOX.height * (1 + BOX.farGrowth), -FLOOR_LENGTH).y;
    const numbers = p(0, -NUMBER_HEIGHT / 2, NUMBER_Z).y;
    expect(farTop / height).toBeGreaterThanOrEqual(0.2);
    // Na caixa estreita do celular quem manda é a largura: o conteúdo encolhe preso ao pé, e o fundo desce
    expect(farTop / height).toBeLessThanOrEqual(width / height > 2 ? 0.3 : 0.5);
    expect(numbers / height).toBeGreaterThan(0.93);
    expect(numbers).toBeLessThanOrEqual(height);
  });

  it('letras G D A E e o rótulo das casas dentro da caixa', () => {
    const letter = p(l.left - LETTER_OFFSET - LETTER_HEIGHT / 2, STRING_HEIGHTS[0], 0);
    const casa = p(l.right + 1.4, 0, NUMBER_Z);
    expect(letter.x).toBeGreaterThanOrEqual(0);
    expect(casa.x).toBeLessThanOrEqual(width);
  });

  it('cordas de cima para baixo G D A E, separadas o bastante para tocar o olho', () => {
    const ys = STRING_HEIGHTS.map((h) => p(0, h, 0).y);
    for (let i = 1; i < 4; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThan(height * 0.07);
  });

  it('a letra da corda tem pelo menos 14 px e a caixa da nota na corda pelo menos 16 px (o dedo legível)', () => {
    const scale = p(l.left - LETTER_OFFSET, STRING_HEIGHTS[3], 0).scale;
    expect(LETTER_HEIGHT * scale).toBeGreaterThanOrEqual(14);
    expect(BOX.height * p(0, STRING_HEIGHTS[3], 0).scale).toBeGreaterThanOrEqual(16);
  });
});

describe('caixa estreita', () => {
  it('abre o campo de visão para as letras e o "CASA" caberem', () => {
    const l = strings3dLayout(600, 550);
    expect(project(l, l.left - LETTER_OFFSET - LETTER_HEIGHT / 2, STRING_HEIGHTS[0], 0).x).toBeGreaterThanOrEqual(0);
    expect(project(l, l.right + 1.35, 0, NUMBER_Z).x).toBeLessThanOrEqual(600);
    expect(l.camera.fov).toBeGreaterThan(strings3dLayout(1280, 550).camera.fov);
  });
});
