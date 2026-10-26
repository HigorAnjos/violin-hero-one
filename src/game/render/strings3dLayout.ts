/**
 * Cordas 3D (Gameplay3D.dc.html, tela 5c): o chão do braço visto de frente, com uma coluna por casa (semitons acima da
 * corda solta), as quatro cordas esticadas na frente, cada uma na sua altura, e as notas vindo do fundo pela coluna da
 * casa, na altura da corda. A nota chega na hora em que encosta na corda (z = 0).
 *
 * Unidades do mundo: a coluna de uma casa mede 1; y é a altura sobre o chão; z cresce na direção do jogador. A câmera,
 * a altura das cordas e o comprimento do chão saem do design (1280×550): o enquadramento é refeito por proporção para
 * qualquer caixa, sem depender de pixel.
 */
import type { EngineNote } from '../engine/types';
import { OPEN_STRING_MIDI, MAX_SPAN_SEMITONES, type StringIndex } from '../notation/violin';

/** Segundos do fundo do chão até a corda, sem nível (LevelSettings.trackLeadSeconds). */
export const LEAD_SECONDS_3D = 2;
/** Casas 0 a 9 do design; uma música que sobe além disso ganha colunas. */
export const MIN_COLUMNS = 10;
/** Altura de cada corda sobre o chão, G D A E: a mais grave em cima, como no design. */
export const STRING_HEIGHTS: readonly [number, number, number, number] = [2.6, 1.9, 1.2, 0.45];
/** Comprimento do chão: do fundo até a linha das cordas. */
export const FLOOR_LENGTH = 48;
/** Câmera do design: altura e distância até a linha das cordas, inclinada para baixo. */
const CAMERA_HEIGHT = 4.25;
const CAMERA_DISTANCE = 6.74;
/**
 * Chão além das casas da ponta, de cada lado: a moldura do acerto (1,24 × a caixa) e a caixa vista de cima da corda
 * ficam inteiras dentro do chão na casa 0 e na última, como no design.
 */
export const FLOOR_MARGIN = 0.75;
/** Até onde as cordas passam do chão à esquerda (a margem do chão já as leva além da casa 0), e o centro da letra. */
export const STRING_OVERHANG = 0;
export const LETTER_OFFSET = 0.45;
/** Linha dos números das casas, à frente das cordas, e o rótulo "CASA" à direita. */
export const NUMBER_Z = 0.5;
export const CASA_OFFSET = 0.25;

/** Tamanho da caixa da nota na linha das cordas; no fundo ela cresce para continuar legível (o design faz o mesmo). */
export const BOX = { width: 0.95, height: 0.6, farGrowth: 0.7 } as const;
/** Altura das letras G D A E e dos números das casas, em unidades do mundo. */
export const LETTER_HEIGHT = 0.5;
export const NUMBER_HEIGHT = 0.36;

/** Onde o conteúdo fica na altura da caixa (0 = topo): o alto é dos cartões de placar e afinação, como no design. */
const TOP_FRACTION = 0.24;
const BOTTOM_FRACTION = 0.965;
/** Folga lateral: o conteúdo ocupa no máximo isto da largura. */
const SIDE_FILL = 0.96;

export interface Strings3DLayout {
  width: number;
  height: number;
  columns: number;
  /** Centro de cada coluna em x; a casa 0 à esquerda. */
  columnX: readonly number[];
  /** Bordas do chão em x: as colunas mais a margem (FLOOR_MARGIN) de cada lado. */
  left: number;
  right: number;
  camera: {
    x: number;
    y: number;
    z: number;
    /** Inclinação para baixo, em radianos. */
    pitch: number;
    /** Campo de visão vertical, em graus (PerspectiveCamera.fov). */
    fov: number;
    /** tan(fov / 2). */
    tanHalf: number;
    aspect: number;
  };
  /** Segundos do fundo até a corda. */
  lead: number;
  /** Unidades de z por segundo de música. */
  speed: number;
}

/** Casa da nota na corda: semitons acima da corda solta (0 = solta). */
export function casaOf(note: Pick<EngineNote, 'midi' | 'string'>): number {
  return Math.max(0, Math.min(MAX_SPAN_SEMITONES, note.midi - OPEN_STRING_MIDI[note.string]));
}

/** Colunas do chão para estas notas: 0 a 9, ou até a casa mais alta. */
export function columnsFor(notes: readonly Pick<EngineNote, 'midi' | 'string'>[]): number {
  return notes.reduce((n, note) => Math.max(n, casaOf(note) + 1), MIN_COLUMNS);
}

interface CameraPose {
  x: number;
  y: number;
  z: number;
  pitch: number;
}

/** Ponto no espaço da câmera: tangentes horizontal e vertical e a profundidade. */
function toCamera(pose: CameraPose, x: number, y: number, z: number): { tx: number; ty: number; depth: number } {
  const dx = x - pose.x;
  const dy = y - pose.y;
  const dz = z - pose.z;
  const sin = Math.sin(pose.pitch);
  const cos = Math.cos(pose.pitch);
  const depth = -dy * sin - dz * cos;
  const up = dy * cos - dz * sin;
  return { tx: dx / depth, ty: up / depth, depth };
}

type Point = readonly [number, number, number];

/** Pontos que precisam caber: o alto (fundo, com a caixa da corda G) e o baixo (números das casas). */
function framePoints(left: number, right: number): { top: Point[]; bottom: Point[]; sides: Point[] } {
  const farBox = STRING_HEIGHTS[0] + BOX.height * (1 + BOX.farGrowth);
  const top: Point[] = [[0, farBox, -FLOOR_LENGTH]];
  // O número é uma placa de pé no chão, centrada em y = 0: o pé dela fica abaixo do chão
  const bottom: Point[] = [[0, -NUMBER_HEIGHT / 2, NUMBER_Z]];
  const sides: Point[] = [
    [left - LETTER_OFFSET - LETTER_HEIGHT / 2, STRING_HEIGHTS[0] + LETTER_HEIGHT / 2, 0],
    [left - LETTER_OFFSET - LETTER_HEIGHT / 2, 0, NUMBER_Z],
    [right + CASA_OFFSET + 0.6, 0, NUMBER_Z + NUMBER_HEIGHT],
    [right, STRING_HEIGHTS[0], 0],
  ];
  return { top, bottom, sides };
}

const maxBy = (points: Point[], pose: CameraPose, f: (p: { tx: number; ty: number }) => number) =>
  points.reduce((best, [x, y, z]) => Math.max(best, f(toCamera(pose, x, y, z))), -Infinity);

/**
 * Enquadramento por proporção: a inclinação e o campo de visão que põem o fundo em TOP_FRACTION e os números das casas
 * em BOTTOM_FRACTION da altura; se a caixa for estreita demais para as letras e o "CASA", abre o campo até caberem.
 */
export function strings3dLayout(width: number, height: number, columns: number = MIN_COLUMNS, lead: number = LEAD_SECONDS_3D): Strings3DLayout {
  const aspect = width > 0 && height > 0 ? width / height : 1;
  const left = -columns / 2 - FLOOR_MARGIN;
  const right = columns / 2 + FLOOR_MARGIN;
  const points = framePoints(left, right);
  // As letras ficam à esquerda: a câmera vai para o meio do conteúdo, não do chão
  const x = (left - LETTER_OFFSET - LETTER_HEIGHT / 2 + right + CASA_OFFSET + 0.6) / 2;
  const pose: CameraPose = { x, y: CAMERA_HEIGHT, z: CAMERA_DISTANCE, pitch: 0 };

  // top / bottom em tangentes: com o quadro simétrico, a fração na tela é 0.5 − ty / (2T)
  const want = (0.5 - TOP_FRACTION) / (0.5 - BOTTOM_FRACTION);
  const ratio = (pitch: number) => {
    pose.pitch = pitch;
    const top = maxBy(points.top, pose, (p) => p.ty);
    const bottom = -maxBy(points.bottom, pose, (p) => -p.ty);
    return top / bottom;
  };
  let lo = 0;
  let hi = Math.PI / 4;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    // Inclinar mais sobe o fundo acima do centro e traz os números para ele: a razão cai com a inclinação
    if (ratio(mid) < want) hi = mid;
    else lo = mid;
  }
  pose.pitch = (lo + hi) / 2;
  const top = maxBy(points.top, pose, (p) => p.ty);
  let tanHalf = top / (2 * (0.5 - TOP_FRACTION));
  const all = [...points.sides, ...points.top, ...points.bottom];
  const sideTan = () => maxBy(all, pose, (p) => Math.abs(p.tx)) / (aspect * SIDE_FILL);
  if (sideTan() > tanHalf) {
    // Caixa estreita: a largura manda. Abre o campo e inclina de novo para os números continuarem no pé da caixa
    const bottomAt = (pitch: number, t: number) => {
      pose.pitch = pitch;
      return 0.5 + maxBy(points.bottom, pose, (p) => -p.ty) / (2 * t);
    };
    for (let round = 0; round < 4; round++) {
      tanHalf = sideTan();
      let a = 0;
      let b = Math.PI / 3;
      for (let i = 0; i < 40; i++) {
        const mid = (a + b) / 2;
        // Inclinar mais sobe os números na tela
        if (bottomAt(mid, tanHalf) > BOTTOM_FRACTION) a = mid;
        else b = mid;
      }
      pose.pitch = (a + b) / 2;
    }
    tanHalf = Math.max(tanHalf, sideTan());
  }

  return {
    width,
    height,
    columns,
    columnX: Array.from({ length: columns }, (_, i) => -columns / 2 + i + 0.5),
    left,
    right,
    camera: { ...pose, fov: (2 * Math.atan(tanHalf) * 180) / Math.PI, tanHalf, aspect },
    lead,
    speed: FLOOR_LENGTH / lead,
  };
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Pixels por unidade do mundo nesta profundidade. */
  scale: number;
}

/** Onde um ponto do mundo cai na caixa, em px (a conta de uma câmera em perspectiva com o fov vertical do layout). */
export function project(l: Strings3DLayout, x: number, y: number, z: number): ScreenPoint {
  return projectInto(l, x, y, z, { x: 0, y: 0, scale: 0 });
}

/** O mesmo que project, escrevendo em `out`: o quadro projeta sem alocar. */
export function projectInto(l: Strings3DLayout, x: number, y: number, z: number, out: ScreenPoint): ScreenPoint {
  const c = l.camera;
  const sin = Math.sin(c.pitch);
  const cos = Math.cos(c.pitch);
  const dx = x - c.x;
  const dy = y - c.y;
  const dz = z - c.z;
  const depth = -dy * sin - dz * cos;
  const up = dy * cos - dz * sin;
  const half = l.height / 2;
  out.x = l.width / 2 + (dx / depth / (c.tanHalf * c.aspect)) * (l.width / 2);
  out.y = half - (up / depth / c.tanHalf) * half;
  out.scale = half / (depth * c.tanHalf);
  return out;
}

/**
 * Onde fica o número da casa `column`: o x é o da coluna na borda da frente do chão, como no design (projetado mais à
 * frente, ele abriria para fora do chão), e o y e a escala são os da linha dos números.
 */
export function casaNumberInto(l: Strings3DLayout, column: number, out: ScreenPoint): ScreenPoint {
  projectInto(l, l.columnX[column], 0, NUMBER_Z, out);
  const { y, scale } = out;
  projectInto(l, l.columnX[column], 0, 0, out);
  out.y = y;
  out.scale = scale;
  return out;
}

/** Menor letra dos rótulos do canvas, em px de tela: a mesma regra do texto das telas (12 px). */
export const MIN_LABEL_PX = 12;

/** z da nota da hora `time` quando o relógio marca `now`: chega à corda (0) na hora e não passa dela. */
export function noteZ(l: Strings3DLayout, time: number, now: number): number {
  return Math.min(0, (now - time) * l.speed);
}

/** A nota entra transparente no fundo e fica opaca nos primeiros 8% do chão. */
export function entryAlpha3d(z: number): number {
  return Math.max(0, Math.min(1, (z + FLOOR_LENGTH) / (FLOOR_LENGTH * 0.08)));
}

/** Escala da caixa da nota em z: 1 na corda, 1 + farGrowth no fundo. */
export function boxScale(z: number): number {
  return 1 + BOX.farGrowth * Math.max(0, Math.min(1, -z / FLOOR_LENGTH));
}

/** Altura da corda (y) e coluna (x) onde a nota encosta. */
export function noteAnchor(l: Strings3DLayout, note: Pick<EngineNote, 'midi' | 'string'>): { x: number; y: number } {
  const column = Math.min(l.columns - 1, casaOf(note));
  return { x: l.columnX[column], y: STRING_HEIGHTS[note.string as StringIndex] };
}
