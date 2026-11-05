import { describe, expect, it } from 'vitest';
import { stageBox, strings3dBox } from './layout';
import {
  BOX,
  COMPACT_FRAMING,
  DESIGN_FRAMING,
  boxScale,
  CASA_OFFSET,
  casaNumberInto,
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
  [932, 430],
] as const;

describe('caixa das Cordas 3D na tela', () => {
  it('1280×720: a largura toda acima da partitura, com a câmera do design', () => {
    expect(strings3dBox(1280, 720)).toEqual({ x: 0, y: 0, width: 1280, height: 550, framing: DESIGN_FRAMING });
  });

  it('celular deitado: do topo ao pé, até a coluna do cartão de afinação, com a câmera do celular', () => {
    expect(strings3dBox(844, 390)).toEqual({ x: 0, y: 0, width: 652, height: 390, framing: COMPACT_FRAMING });
    expect(strings3dBox(932, 430)).toEqual({ x: 0, y: 0, width: 740, height: 430, framing: COMPACT_FRAMING });
  });

  it('com entalhe: começa depois da área segura da esquerda e a coluna da direita afasta junto com o cartão', () => {
    // 844 − 47 (entalhe) − 170 (cartão) − 8 (folga), a partir de x 47
    expect(strings3dBox(844, 390, { left: 47, right: 47 })).toEqual({ x: 47, y: 0, width: 572, height: 390, framing: COMPACT_FRAMING });
  });

  it('a partir de 501 px de altura, a do design', () => {
    expect(strings3dBox(1000, 501).framing).toBe(DESIGN_FRAMING);
  });

  it('botão Pauta ligado no celular deitado: a mesma coluna, parando em cima da pauta de 116 px', () => {
    expect(strings3dBox(844, 390, undefined, true)).toEqual({ x: 0, y: 0, width: 652, height: 274, framing: COMPACT_FRAMING });
    expect(strings3dBox(932, 430, undefined, true)).toEqual({ x: 0, y: 0, width: 740, height: 314, framing: COMPACT_FRAMING });
  });

  it('botão Pauta ligado não muda o desktop', () => {
    expect(strings3dBox(1280, 720, undefined, true)).toEqual(strings3dBox(1280, 720));
  });

  it.each([
    [844, 390],
    [932, 430],
  ])('%i×%i com a pauta: as quatro cordas, as letras e o "CASA" ainda cabem na caixa menor', (w, h) => {
    const { width, height, framing } = strings3dBox(w, h, undefined, true);
    const l = strings3dLayout(width, height, MIN_COLUMNS, 2, framing);
    expect(project(l, l.left - LETTER_OFFSET - LETTER_HEIGHT / 2, STRING_HEIGHTS[0], 0).x).toBeGreaterThanOrEqual(0);
    expect(project(l, l.right + CASA_OFFSET + 0.6, 0, NUMBER_Z).x).toBeLessThanOrEqual(width);
    expect(project(l, 0, 0, NUMBER_Z).y).toBeLessThanOrEqual(height);
  });
});

describe('câmera do celular deitado', () => {
  const noteHeight = (l: ReturnType<typeof strings3dLayout>, z: number) => BOX.height * boxScale(z) * project(l, 0, STRING_HEIGHTS[0], z).scale;

  it.each([
    [844, 390],
    [932, 430],
  ])('%i×%i: a nota nasce com mais de 3× a altura de antes (440×272 do lado da pista, câmera do design)', (w, h) => {
    const { width, height, framing } = strings3dBox(w, h);
    const now = strings3dLayout(width, height, MIN_COLUMNS, 2, framing);
    const before = strings3dLayout(stageBox(w, 1000).width, h - 118, MIN_COLUMNS, 2);
    expect(noteHeight(now, -FLOOR_LENGTH)).toBeGreaterThan(3 * noteHeight(before, -FLOOR_LENGTH));
    expect(noteHeight(now, -FLOOR_LENGTH)).toBeGreaterThanOrEqual(12);
  });

  it('o fundo sobe para perto do topo (o placar fica no canto, fora do chão)', () => {
    const { width, height, framing } = strings3dBox(844, 390);
    const l = strings3dLayout(width, height, MIN_COLUMNS, 2, framing);
    const farTop = project(l, 0, STRING_HEIGHTS[0] + BOX.height * (1 + BOX.farGrowth), -FLOOR_LENGTH).y;
    expect(farTop / height).toBeLessThan(0.1);
    // O chão na altura do pé do placar (~7,75rem) começa à direita dele (10,625rem a 0,875rem da borda)
    let z = -FLOOR_LENGTH;
    while (project(l, l.left, 0, z).y < 124) z += 0.1;
    expect(project(l, l.left, 0, z).x).toBeGreaterThan(14 + 170);
  });

  it('com 13 casas ainda cabe e o fundo fica na metade de cima', () => {
    const { width, height, framing } = strings3dBox(844, 390);
    const l = strings3dLayout(width, height, 13, 2, framing);
    expect(project(l, l.left - LETTER_OFFSET - LETTER_HEIGHT / 2, STRING_HEIGHTS[0], 0).x).toBeGreaterThanOrEqual(0);
    expect(project(l, l.right + CASA_OFFSET + 0.6, 0, NUMBER_Z).x).toBeLessThanOrEqual(width);
    expect(project(l, 0, 0, -FLOOR_LENGTH).y / height).toBeLessThan(0.5);
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
    // As 10 casas medem ~880 px na linha das cordas; o chão passa delas pela margem
    const left = project(l, l.columnX[0] - 0.5, 0, 0).x;
    const right = project(l, l.columnX[9] + 0.5, 0, 0).x;
    expect(right - left).toBeGreaterThan(800);
    expect(right - left).toBeLessThan(900);
    expect(project(l, l.left, 0, 0).x).toBeLessThan(left);
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
  const { width, height, framing } = strings3dBox(viewportWidth, viewportHeight);
  const l = strings3dLayout(width, height, MIN_COLUMNS, 2, framing);
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

  it('o fundo fica no alto (sob os cartões no desktop, perto do topo no celular) e os números das casas no pé da caixa', () => {
    const farTop = p(0, STRING_HEIGHTS[0] + BOX.height * (1 + BOX.farGrowth), -FLOOR_LENGTH).y;
    const numbers = p(0, -NUMBER_HEIGHT / 2, NUMBER_Z).y;
    expect(farTop / height).toBeGreaterThanOrEqual(framing.top - 0.01);
    expect(farTop / height).toBeLessThanOrEqual(framing.top + 0.06);
    expect(numbers / height).toBeGreaterThan(0.93);
    expect(numbers).toBeLessThanOrEqual(height);
  });

  it('casas 0 e 9 inteiras dentro do chão: o número e a moldura do acerto na corda Mi', () => {
    const out = { x: 0, y: 0, scale: 0 };
    const nearLeft = p(l.left, 0, 0).x;
    const nearRight = p(l.right, 0, 0).x;
    const half = (casaNumberInto(l, 0, out), out.scale * NUMBER_HEIGHT * 0.4);
    expect(casaNumberInto(l, 0, out).x - half).toBeGreaterThan(nearLeft);
    expect(casaNumberInto(l, l.columns - 1, out).x + half).toBeLessThan(nearRight);
    // A borda do chão na altura da tela em que a moldura está (o chão sobe em perspectiva)
    const borderAt = (edge: number, screenY: number) => {
      let lo = -FLOOR_LENGTH;
      let hi = 0;
      for (let i = 0; i < 50; i++) {
        const mid = (lo + hi) / 2;
        if (p(edge, 0, mid).y < screenY) lo = mid;
        else hi = mid;
      }
      return p(edge, 0, (lo + hi) / 2).x;
    };
    const frame = (BOX.width * 1.24) / 2;
    const e = STRING_HEIGHTS[3];
    const leftFrame = p(l.columnX[0] - frame, e, 0);
    const rightFrame = p(l.columnX[l.columns - 1] + frame, e, 0);
    expect(leftFrame.x).toBeGreaterThanOrEqual(borderAt(l.left, leftFrame.y));
    expect(rightFrame.x).toBeLessThanOrEqual(borderAt(l.right, rightFrame.y));
  });

  it('letras G D A E e o rótulo das casas dentro da caixa', () => {
    const letter = p(l.left - LETTER_OFFSET - LETTER_HEIGHT / 2, STRING_HEIGHTS[0], 0);
    const casa = p(l.right + CASA_OFFSET + 0.6, 0, NUMBER_Z);
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
    expect(project(l, l.right + CASA_OFFSET + 0.6, 0, NUMBER_Z).x).toBeLessThanOrEqual(600);
    expect(l.camera.fov).toBeGreaterThan(strings3dLayout(1280, 550).camera.fov);
  });
});
