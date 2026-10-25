/**
 * Pista Arcade em perspectiva, do jeito do design (Gameplay.dc.html): um plano inclinado para trás
 * com rotateX e perspectiva CSS. A projeção aqui é a mesma do navegador, então as proporções do
 * design valem para qualquer tamanho; tudo é fração da caixa da pista.
 */

/** Segundos que uma nota leva do topo da pista até a linha de acerto. */
export const LEAD_SECONDS = 2;
/** Depois da hora, a nota perdida ainda cai este tanto antes de sumir. */
export const MISS_TAIL_SECONDS = 0.5;
/** Notas a partir desta duração ganham cauda (arco sustentado). */
export const HOLD_MIN_SECONDS = 0.6;
/** Folga entre o fim da cauda e a nota seguinte na mesma corda. */
const TAIL_GAP_SECONDS = 0.08;

const TILT = (58 * Math.PI) / 180;
const SIDE_GUTTER = 16;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Onde a caixa da pista fica na tela de jogo: centralizada no alto, entre os cartões laterais e
 * acima da partitura. 1280×720 dá 640×550 e 844×390 dá 440×272, como no design.
 */
export function stageBox(viewportWidth: number, viewportHeight: number): Box {
  const sheet = Math.max(118, Math.round(viewportHeight * 0.236));
  const width = Math.round(Math.min(viewportWidth - SIDE_GUTTER * 2, Math.max(440, Math.min(640, viewportWidth * 0.5))));
  return { x: Math.round((viewportWidth - width) / 2), y: 0, width, height: Math.max(0, viewportHeight - sheet) };
}

export interface TrackLayout {
  width: number;
  height: number;
  /** Distância do olho à tela (perspective do CSS). */
  perspective: number;
  originX: number;
  originY: number;
  cos: number;
  sin: number;
  /** y na tela da borda de baixo do plano (abaixo da caixa, como no design). */
  planeBottom: number;
  planeWidth: number;
  laneWidth: number;
  /** Centro de cada trilha, em unidades do plano a partir do eixo; G D A E da esquerda para a direita. */
  lanes: readonly [number, number, number, number];
  /** Profundidades, em unidades do plano a partir da borda de baixo. */
  hitDepth: number;
  letterDepth: number;
  /** Onde o plano cruza o topo da caixa. */
  farDepth: number;
  /** Onde uma nota aparece (inteira dentro da caixa). */
  enterDepth: number;
  note: { width: number; height: number };
  tailWidth: number;
  targetRadius: number;
  targetStroke: number;
  letterSize: number;
  /** Unidades do plano por segundo de música. */
  speed: number;
  feedback: { x: number; y: number; size: number; detailSize: number };
}

export function trackLayout(width: number, height: number): TrackLayout {
  const perspective = height * 1.6;
  const originY = height * 0.08;
  const planeBottom = height * 1.11;
  const cos = Math.cos(TILT);
  const sin = Math.sin(TILT);
  const planeWidth = Math.min(width * 0.78, height * 1.1);
  const laneWidth = planeWidth / 4;
  const noteWidth = laneWidth * 0.72;
  const noteHeight = noteWidth * 0.4;
  const hitDepth = height * 0.345;
  const farDepth = (planeBottom * perspective) / (cos * perspective - originY * sin);
  const enterDepth = farDepth - noteHeight;
  const feedbackSize = Math.max(20, Math.round(height * 0.085));
  return {
    width,
    height,
    perspective,
    originX: width / 2,
    originY,
    cos,
    sin,
    planeBottom,
    planeWidth,
    laneWidth,
    lanes: [-1.5 * laneWidth, -0.5 * laneWidth, 0.5 * laneWidth, 1.5 * laneWidth],
    hitDepth,
    letterDepth: height * 0.19,
    farDepth,
    enterDepth,
    note: { width: noteWidth, height: noteHeight },
    tailWidth: laneWidth * 0.13,
    targetRadius: laneWidth * 0.28,
    targetStroke: laneWidth * 0.04,
    letterSize: laneWidth * 0.32,
    speed: (enterDepth - hitDepth) / LEAD_SECONDS,
    feedback: {
      x: width / 2,
      y: Math.round(height * 0.36),
      size: feedbackSize,
      detailSize: Math.max(12, Math.round(feedbackSize * 0.35)),
    },
  };
}

/** Quanto um objeto à profundidade `depth` encolhe na tela (1 na borda de baixo do plano). */
export function depthScale(l: TrackLayout, depth: number): number {
  return l.perspective / (l.perspective + depth * l.sin);
}

export function projectY(l: TrackLayout, depth: number): number {
  return l.originY + (l.planeBottom - depth * l.cos - l.originY) * depthScale(l, depth);
}

/** x na tela de um ponto a `x` unidades do eixo do plano. */
export function projectX(l: TrackLayout, x: number, depth: number): number {
  return l.originX + x * depthScale(l, depth);
}

/** Profundidade de uma nota da hora `noteTime` quando o relógio marca `now` (mesmo relógio). */
export function noteDepth(l: TrackLayout, noteTime: number, now: number): number {
  return l.hitDepth + (noteTime - now) * l.speed;
}

/** A nota entra transparente no topo e fica opaca ao descer a própria altura. */
export function entryAlpha(l: TrackLayout, depth: number): number {
  return Math.max(0, Math.min(1, (l.enterDepth - depth) / l.note.height));
}

/** Comprimento da cauda em segundos, ou 0 quando a nota é curta demais para ter cauda. */
export function tailSeconds(duration: number): number {
  return duration >= HOLD_MIN_SECONDS ? duration - TAIL_GAP_SECONDS : 0;
}

/** Primeiro índice com tempo ≥ t num vetor crescente (busca binária, sem alocar). */
export function lowerBound(times: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Maior número de notas que cabe numa janela de `window` segundos: o tamanho do pool de sprites. */
export function maxNotesInWindow(times: ArrayLike<number>, window: number): number {
  let best = 0;
  let start = 0;
  for (let end = 0; end < times.length; end++) {
    while (times[end] - times[start] > window) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
}
