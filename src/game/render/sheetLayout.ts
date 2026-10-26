/**
 * Faixa de partitura (SheetStrip.dc e tela 5b, GameplaySheet.dc): pauta em clave de sol que corre da direita para a
 * esquerda sob a agulha do "agora". As notas ficam em tempos da música, não em segundos: o espaço entre elas é o da
 * escrita e só a velocidade muda com o andamento. Tudo é medido no espaço entre linhas da pauta (`space`).
 */

/**
 * Trecho de andamento constante do relógio da partida: do instante `time` (AudioContext) a `endTime`, a música anda de
 * `beat` a `endBeat` (exclusivo) a `spb` segundos por tempo. Mesma forma do TempoSegment da orquestra (src/game/synth),
 * repetida aqui porque render e synth não se importam.
 */
export interface BeatSegment {
  time: number;
  beat: number;
  spb: number;
  endTime: number;
  endBeat: number;
}

/** De onde a faixa tira o tempo da música: a prática (laço A–B e andamento) ou um andamento só. */
export interface SheetClock {
  /** Os trechos desde o começo da partida até pelo menos `until`, em ordem. */
  segments(until: number): readonly BeatSegment[];
}

/** Partida sem prática: o primeiro tempo em `startAt`, andamento fixo. */
export function steadyClock(startAt: number, bpm: number): SheetClock {
  if (!(bpm > 0) || !Number.isFinite(startAt)) throw new RangeError(`relógio inválido: startAt ${startAt}, bpm ${bpm}`);
  const segments: readonly BeatSegment[] = [{ time: startAt, beat: 0, spb: 60 / bpm, endTime: Infinity, endBeat: Infinity }];
  return { segments: () => segments };
}

/**
 * Pedaço da música visível na faixa: os tempos [fromBeat, toBeat) aparecem a `warp.forward(beat) + shift` tempos de
 * faixa da agulha (negativo = já passou). Uma volta do laço vira dois pedaços: o fim de B e, logo depois dele, o começo
 * de A.
 */
export interface BeatWindow {
  fromBeat: number;
  toBeat: number;
  shift: number;
  /** Instante do AudioContext do tempo `beat` neste pedaço: time + (beat − segment.beat) × spb. */
  time: number;
  beat: number;
  spb: number;
  /**
   * A passada contínua da música em que este pedaço está, em tempos: do salto (ou do começo) até o próximo salto do
   * laço. A troca de andamento não corta a passada. A ligadura só se desenha com as duas notas na mesma passada.
   */
  passFrom: number;
  passTo: number;
}

/**
 * Do tempo da música ao "tempo de faixa", em que a faixa mede o espaço: crescente e contínua, inclinação 1 fora das
 * notas. O espaçamento é proporcional, mas dois ataques seguidos nunca ficam a menos de `minGap` tempos de faixa: a
 * semicolcheia e a pausa curta não colam na vizinha. A nota continua passando na agulha na hora dela; só a velocidade
 * da faixa muda no trecho apertado.
 */
export interface BeatWarp {
  forward(beat: number): number;
  inverse(spaced: number): number;
}

export const IDENTITY_WARP: BeatWarp = { forward: (beat) => beat, inverse: (spaced) => spaced };

/** Menor vão entre dois ataques na faixa, em espaços da pauta: cabeça, dedo + letra e nome da nota sem encostar. */
export const MIN_GAP_SPACES = 3;
/** Largura de um tempo na faixa, em espaços (o design: 100 px por tempo com espaço de 18 px). */
export const BEAT_SPACES = 5.6;
/** MIN_GAP_SPACES em tempos de faixa: o mesmo em qualquer tamanho, porque tudo escala com o espaço. */
export const MIN_GAP_BEATS = MIN_GAP_SPACES / BEAT_SPACES;

function bisect(xs: Float64Array, x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (xs[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A deformação para os ataques em `onsets` (notas e pausas, em qualquer ordem, com repetição). */
export function beatWarp(onsets: ArrayLike<number>, minGap: number = MIN_GAP_BEATS): BeatWarp {
  const beats = Float64Array.from(new Set(Array.from(onsets))).sort();
  if (beats.length < 2) return IDENTITY_WARP;
  const spaced = new Float64Array(beats.length);
  spaced[0] = beats[0];
  for (let i = 1; i < beats.length; i++) spaced[i] = spaced[i - 1] + Math.max(beats[i] - beats[i - 1], minGap);
  // Entre dois nós, reta; antes do primeiro e depois do último, inclinação 1
  const map = (from: Float64Array, to: Float64Array, x: number) => {
    if (!(x > from[0])) return to[0] + (x - from[0]);
    const i = bisect(from, x);
    if (i === from.length - 1) return to[i] + (x - from[i]);
    return to[i] + ((x - from[i]) * (to[i + 1] - to[i])) / (from[i + 1] - from[i]);
  };
  return { forward: (beat) => map(beats, spaced, beat), inverse: (s) => map(spaced, beats, s) };
}

/** O trecho `b` continua o `a` sem salto (só o andamento pode mudar). */
const continues = (a: BeatSegment, b: BeatSegment) => Math.abs(a.endBeat - b.beat) < 1e-9;

function segmentIndexAt(segments: readonly BeatSegment[], t: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function put(
  out: BeatWindow[],
  count: number,
  segments: readonly BeatSegment[],
  j: number,
  fromBeat: number,
  toBeat: number,
  startDistance: number,
  warp: BeatWarp,
): number {
  if (!(toBeat > fromBeat)) return count;
  const segment = segments[j];
  const w = out[count] ?? (out[count] = { fromBeat: 0, toBeat: 0, shift: 0, time: 0, beat: 0, spb: 1, passFrom: 0, passTo: 0 });
  let first = j;
  while (first > 0 && continues(segments[first - 1], segments[first])) first--;
  let last = j;
  while (last + 1 < segments.length && continues(segments[last], segments[last + 1])) last++;
  w.passFrom = segments[first].beat;
  w.passTo = segments[last].endBeat;
  w.fromBeat = fromBeat;
  w.toBeat = toBeat;
  w.shift = startDistance - warp.forward(segment.beat);
  w.time = segment.time;
  w.beat = segment.beat;
  w.spb = segment.spb;
  return count + 1;
}

/** Tempo da música no instante `now`; antes do primeiro trecho, conta para trás (a entrada). */
export function beatAt(segments: readonly BeatSegment[], now: number): number {
  const s = segments[segmentIndexAt(segments, now)];
  return s.beat + (now - s.time) / s.spb;
}

/**
 * Os pedaços da música entre `behind` tempos de faixa atrás e `ahead` à frente da agulha, em `out` (reaproveitado, sem
 * alocar no quadro); devolve quantos. O espaço é contado em tempos tocados: depois do salto do laço, A vem colado em B.
 */
export function beatWindows(
  segments: readonly BeatSegment[],
  now: number,
  behind: number,
  ahead: number,
  out: BeatWindow[],
  warp: BeatWarp = IDENTITY_WARP,
): number {
  if (segments.length === 0) return 0;
  const f = warp.forward;
  const g = warp.inverse;
  const span = (s: BeatSegment) => f(s.endBeat) - f(s.beat);
  const k = segmentIndexAt(segments, now);
  const current = segments[k];
  const nowSpaced = f(current.beat + (now - current.time) / current.spb);
  let count = 0;

  // Para trás: distância do começo de cada trecho até a agulha
  let end = f(current.beat) - nowSpaced;
  const before: [number, number][] = [];
  for (let j = k - 1; j >= 0 && end > -behind; j--) {
    const start = end - span(segments[j]);
    before.push([j, start]);
    end = start;
  }
  for (let i = before.length - 1; i >= 0; i--) {
    const [j, start] = before[i];
    const s = segments[j];
    count = put(out, count, segments, j, Math.max(s.beat, g(f(s.beat) - behind - start)), s.endBeat, start, warp);
  }

  const back = g(nowSpaced - behind);
  const from = k === 0 ? back : Math.max(current.beat, back);
  count = put(out, count, segments, k, from, Math.min(current.endBeat, g(nowSpaced + ahead)), f(current.beat) - nowSpaced, warp);

  let start = f(current.endBeat) - nowSpaced;
  for (let j = k + 1; j < segments.length && start < ahead; j++) {
    const s = segments[j];
    count = put(out, count, segments, j, s.beat, Math.min(s.endBeat, g(f(s.beat) + ahead - start)), start, warp);
    start += span(s);
  }
  return count;
}

/** Instante do AudioContext em que o tempo `beat` toca neste pedaço. */
export function windowTime(w: BeatWindow, beat: number): number {
  return w.time + (beat - w.beat) * w.spb;
}

/** Grau diatônico da linha do meio (Si4): a pauta é desenhada a partir dela. */
export const MIDDLE_STEP = 34;
export const BOTTOM_STEP = MIDDLE_STEP - 4;
export const TOP_STEP = MIDDLE_STEP + 4;

/** Abaixo desta altura a faixa é a compacta (SheetStrip.dc, celular deitado): sem o nome da nota. */
export const COMPACT_HEIGHT = 180;
const MAX_SPACE = 18;

export interface SheetLayout {
  width: number;
  height: number;
  /** Espaço entre linhas da pauta, em px. */
  space: number;
  compact: boolean;
  middleY: number;
  /** Largura da área fixa da clave e da armadura, que cobre as notas que já passaram. */
  clefWidth: number;
  needleX: number;
  pxPerBeat: number;
  /** Tempos visíveis atrás e à frente da agulha (com folga para a nota não piscar na borda). */
  behind: number;
  ahead: number;
  head: { rx: number; ry: number };
  stem: { length: number; width: number };
  line: number;
  ledgerHalf: number;
  fingerY: number;
  fingerSize: number;
  nameY: number;
  nameSize: number;
  numberY: number;
  numberSize: number;
  needle: { top: number; bottom: number; width: number; zone: number; labelY: number; labelSize: number };
  clef: { x: number; y: number; size: number };
  keyX: number;
  keyStep: number;
  accidentalSize: number;
  /** Faixa da duração da nota que soa, centrada na cabeça. */
  holdHeight: number;
}

/**
 * Medidas do design: na tela 5b (280 px de altura) o espaço é 18 px, a agulha fica a 140 px da clave e um tempo ocupa
 * 100 px; na faixa compacta (112 px) o espaço é 10 px. Daí as frações de `space`.
 */
export function sheetLayout(width: number, height: number, keyAccidentals: number): SheetLayout {
  const compact = height < COMPACT_HEIGHT;
  const space = Math.max(4, Math.min(MAX_SPACE, compact ? height / 11.2 : height / 15.5));
  const middleY = compact ? height * 0.46 : height * 0.536;
  const keyX = space * 4.9;
  const keyStep = space * 1.22;
  const clefWidth = keyX + keyAccidentals * keyStep + space * 1.5;
  const needleX = Math.min(clefWidth + space * 7.8, width * 0.45);
  const pxPerBeat = space * BEAT_SPACES;
  const fingerY = middleY + space * 5.1;
  return {
    width,
    height,
    space,
    compact,
    middleY,
    clefWidth,
    needleX,
    pxPerBeat,
    behind: (needleX - clefWidth) / pxPerBeat + 1,
    ahead: (width - needleX) / pxPerBeat + 1,
    head: { rx: space * 0.64, ry: space * 0.47 },
    stem: { length: space * 3.2, width: Math.max(1.2, space * 0.12) },
    line: Math.max(1, space * 0.09),
    ledgerHalf: space * 1.2,
    fingerY,
    fingerSize: compact ? space * 1.3 : space,
    nameY: fingerY + space * 1.15,
    nameSize: space * 0.72,
    numberY: middleY - space * 3,
    numberSize: Math.max(10, space * 0.78),
    needle: {
      top: compact ? space * 0.6 : middleY - space * 4.9,
      bottom: compact ? height - space * 0.6 : middleY + space * 4.8,
      width: Math.max(2, space * 0.17),
      zone: space * 2.67,
      labelY: compact ? space * 0.2 : middleY - space * 5.3,
      labelSize: Math.max(9, space * 0.61),
    },
    clef: { x: space * 0.8, y: middleY + space * 0.35, size: space * 5.8 },
    keyX,
    keyStep,
    accidentalSize: space * 1.78,
    holdHeight: space * 0.67,
  };
}

/** y do grau diatônico na pauta (graus pares nas linhas). */
export function stepY(l: SheetLayout, step: number): number {
  return l.middleY - ((step - MIDDLE_STEP) * l.space) / 2;
}

/** x na tela de um ponto a `distance` tempos da agulha. */
export function beatX(l: SheetLayout, distance: number): number {
  return l.needleX + distance * l.pxPerBeat;
}

/** No design a barra fica meio tempo antes da primeira nota do compasso. */
export const BAR_LEAD_BEATS = 0.5;

/**
 * Quantos tempos antes do início de cada compasso vai a barra: meio tempo, ou o meio do vão quando a última nota do
 * compasso anterior começa mais perto (colcheia no fim), para a barra não cair em cima dela.
 */
export function barOffsets(bars: ArrayLike<number>, noteStarts: ArrayLike<number>): Float64Array {
  return Float64Array.from(bars, (start) => {
    let previous = -Infinity;
    for (let i = 0; i < noteStarts.length && noteStarts[i] < start; i++) previous = noteStarts[i];
    return Math.min(BAR_LEAD_BEATS, (start - previous) / 2);
  });
}

/** As notas somem ao entrar sob a clave: a cabeça começa a apagar um espaço e meio antes da borda. */
export function clefFade(l: SheetLayout, x: number): number {
  return Math.max(0, Math.min(1, (x - l.head.rx - l.clefWidth) / (l.space * 1.5)));
}

export interface TieArc {
  /** Ponta esquerda do arco. */
  x: number;
  y: number;
  width: number;
  /** Flecha do arco: positiva abaixo das pontas, negativa acima. */
  height: number;
}

/**
 * Arco da ligadura entre as cabeças em `x0` e `x1` (escrito em `out`, sem alocar no quadro): do lado contrário à haste,
 * colado às cabeças, começando depois do ponto da primeira; quanto mais longo, mais alto.
 */
export function tieArc(l: SheetLayout, x0: number, x1: number, tie: { step: number; below: boolean; dotted: boolean }, out: TieArc): TieArc {
  const start = x0 + (tie.dotted ? l.head.rx + l.space * 0.9 : l.head.rx * 0.8);
  const end = x1 - l.head.rx * 0.8;
  const width = Math.max(l.space * 0.5, end - start);
  const height = l.space * Math.min(1.1, Math.max(0.45, 0.3 + (0.06 * width) / l.space));
  out.x = start;
  out.width = width;
  out.y = stepY(l, tie.step) + (tie.below ? 1 : -1) * l.space * 0.55;
  out.height = tie.below ? height : -height;
  return out;
}

/**
 * A ligadura entre as notas que começam em `fromAt` e `toAt` aparece neste pedaço? Só com as duas na mesma passada (no
 * salto do laço a última nota de B não se liga à primeira de A) e só no primeiro pedaço visível que o arco toca, para
 * não sair duas vezes quando a troca de andamento divide a passada.
 */
export function tieShows(win: BeatWindow, previous: BeatWindow | undefined, fromAt: number, toAt: number): boolean {
  if (fromAt < win.passFrom - 1e-9 || toAt > win.passTo - 1e-9) return false;
  if (toAt < win.fromBeat || fromAt >= win.toBeat) return false;
  const sameRun = previous !== undefined && Math.abs(previous.shift - win.shift) < 1e-9 && Math.abs(previous.toBeat - win.fromBeat) < 1e-9;
  return !(sameRun && fromAt < win.fromBeat);
}

/** Julgamento e nota se encontram por noteIndex; a cópia certa (a volta do laço) é a que toca perto do julgamento. */
export const MARK_WINDOW_SECONDS = 0.6;

export function markApplies(copyTime: number, judgedAt: number): boolean {
  return Math.abs(copyTime - judgedAt) <= MARK_WINDOW_SECONDS;
}

export const PASSED_ALPHA = 0.35;

/** A nota que já passou inteira pela agulha fica apagada, a não ser que tenha sido acertada. */
export function noteAlpha(distance: number, beats: number, hit: boolean): number {
  return hit || distance + beats > 0 ? 1 : PASSED_ALPHA;
}
