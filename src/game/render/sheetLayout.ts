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
 * Pedaço da música visível na faixa: os tempos [fromBeat, toBeat) aparecem a `beat + shift` tempos da agulha (negativo =
 * já passou). Uma volta do laço vira dois pedaços: o fim de B e, logo depois dele, o começo de A.
 */
export interface BeatWindow {
  fromBeat: number;
  toBeat: number;
  shift: number;
  /** Instante do AudioContext do tempo `beat` neste pedaço: time + (beat − segment.beat) × spb. */
  time: number;
  beat: number;
  spb: number;
}

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

function put(out: BeatWindow[], count: number, segment: BeatSegment, fromBeat: number, toBeat: number, startDistance: number): number {
  if (!(toBeat > fromBeat)) return count;
  const w = out[count] ?? (out[count] = { fromBeat: 0, toBeat: 0, shift: 0, time: 0, beat: 0, spb: 1 });
  w.fromBeat = fromBeat;
  w.toBeat = toBeat;
  w.shift = startDistance - segment.beat;
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
 * Os pedaços da música entre `behind` tempos atrás e `ahead` tempos à frente da agulha, em `out` (reaproveitado, sem
 * alocar no quadro); devolve quantos. O espaço é contado em tempos tocados: depois do salto do laço, A vem colado em B.
 */
export function beatWindows(segments: readonly BeatSegment[], now: number, behind: number, ahead: number, out: BeatWindow[]): number {
  if (segments.length === 0) return 0;
  const k = segmentIndexAt(segments, now);
  const current = segments[k];
  const nowBeat = current.beat + (now - current.time) / current.spb;
  let count = 0;

  // Para trás: distância do começo de cada trecho até a agulha
  let end = current.beat - nowBeat;
  const before: [BeatSegment, number][] = [];
  for (let j = k - 1; j >= 0 && end > -behind; j--) {
    const s = segments[j];
    const start = end - (s.endBeat - s.beat);
    before.push([s, start]);
    end = start;
  }
  for (let i = before.length - 1; i >= 0; i--) {
    const [s, start] = before[i];
    count = put(out, count, s, Math.max(s.beat, s.beat - behind - start), s.endBeat, start);
  }

  const from = k === 0 ? nowBeat - behind : Math.max(current.beat, nowBeat - behind);
  count = put(out, count, current, from, Math.min(current.endBeat, nowBeat + ahead), current.beat - nowBeat);

  let start = current.beat - nowBeat + (current.endBeat - current.beat);
  for (let j = k + 1; j < segments.length && start < ahead; j++) {
    const s = segments[j];
    count = put(out, count, s, s.beat, Math.min(s.endBeat, s.beat + ahead - start), start);
    start += s.endBeat - s.beat;
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
  const pxPerBeat = space * 5.6;
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
