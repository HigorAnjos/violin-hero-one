import { songDurationBeats, type Song } from '../notation/song';

/** Fator de andamento aceito por setTempo: a prática vai de 50% a 100%. */
export const MIN_TEMPO_FACTOR = 0.5;
export const MAX_TEMPO_FACTOR = 1;

/**
 * Um trecho de andamento constante: do instante `time` (relógio do AudioContext) até `endTime`, a música anda de `beat`
 * até `endBeat` (exclusivo) a `spb` segundos por tempo. O último trecho é aberto (`endTime` e `endBeat` infinitos).
 */
export interface TempoSegment {
  time: number;
  beat: number;
  spb: number;
  endTime: number;
  endBeat: number;
}

/** Âncora para colocar uma nota: instante = time + (tempo da nota − beat) × spb. */
export interface TimelineSpan {
  time: number;
  beat: number;
  spb: number;
  /** Os tempos da música cobertos por este trecho, [fromBeat, toBeat). */
  fromBeat: number;
  toBeat: number;
}

/** Laço A–B por compasso, índices a partir de 0, inclusivos: toca de A até o fim de B e volta ao início de A. */
export interface LoopRange {
  startMeasure: number;
  endMeasure: number;
}

export interface TimelineOptions {
  /** Tempo do AudioContext do primeiro tempo da música: o mesmo startAt do Motor. */
  startAt: number;
  /** Andamento da partida, o de fator 1; padrão: o da música. */
  bpm?: number;
}

export interface TimelineCursor {
  /**
   * Os trechos de música entre a posição atual e `to`, em ordem; avança a posição e congela a linha do tempo até `to`.
   * Partição exata por tempo da música: chamadas seguidas nunca repetem nem pulam um tempo.
   */
  advance(to: number): TimelineSpan[];
}

export interface Timeline {
  readonly startAt: number;
  /** Andamento de fator 1. */
  readonly bpm: number;
  /** Até onde a linha do tempo já não muda (o que o agendador já mandou para o AudioContext). */
  readonly committed: number;
  readonly loop: LoopRange | null;
  /**
   * Muda o andamento a partir de `at` (ou do instante congelado, se `at` for anterior) e devolve o instante em que vale.
   * Descarta mudanças pedidas antes para depois desse instante.
   */
  setTempo(factor: number, at: number): number;
  /**
   * Liga (ou desliga, com null) o laço a partir do instante congelado, que devolve. Se a música já passou do fim de B,
   * salta no próximo início de compasso.
   */
  setLoop(range: LoopRange | null): number;
  /** Tempo da música no instante `t`. No instante de um salto do laço, o fim de B. */
  beatAt(t: number): number;
  /** Os trechos até `until`: os congelados e a projeção com as mudanças pedidas e o laço atual. */
  segments(until: number): TempoSegment[];
  /** Sem efeito colateral: os trechos de música entre `from` e `to` (inclusivo), para consultas como soundingAt. */
  spans(from: number, to: number): TimelineSpan[];
  /** Agendador que começa no instante `from`. */
  cursor(from: number): TimelineCursor;
}

interface LoopState {
  range: LoopRange;
  startBeat: number;
  endBeat: number;
  /** Onde o próximo salto acontece: o fim de B, ou o próximo compasso se o laço foi ligado já depois de B. */
  jumpBeat: number;
}

interface TempoChange {
  time: number;
  spb: number;
}

interface Projection {
  segments: TempoSegment[];
  pending: TempoChange[];
  loop: LoopState | null;
}

const beatIn = (segment: TempoSegment, t: number) => segment.beat + (t - segment.time) / segment.spb;

function segmentIndexAt(segments: readonly TempoSegment[], t: number): number {
  let lo = 0;
  let hi = segments.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segments[mid].time <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function open(time: number, beat: number, spb: number): TempoSegment {
  return { time, beat, spb, endTime: Infinity, endBeat: Infinity };
}

/**
 * Mapa entre o tempo da música e o relógio do AudioContext, em trechos de andamento constante, com mudança de andamento
 * e laço A–B. Com um só trecho a conta é startAt + tempo × 60/bpm, bit a bit a do scheduleNotes do Motor: sem erro
 * acumulado. Puro e sem Tone; só a orquestra o usa: cada volta do laço e cada troca de andamento é um Motor novo,
 * criado pela shell no instante que setTempo e setLoop devolvem (Decisões, "Prática no motor").
 *
 * O passado é imutável: o agendador congela o que já mandou para o AudioContext (cursor.advance), e toda mudança vale do
 * instante congelado em diante.
 */
export function createTimeline(song: Song, options: TimelineOptions): Timeline {
  const { startAt, bpm = song.bpm } = options;
  if (!(bpm > 0) || !Number.isFinite(bpm)) throw new RangeError(`bpm inválido: ${bpm}`);
  if (!Number.isFinite(startAt)) throw new RangeError(`startAt inválido: ${startAt}`);
  const baseSpb = 60 / bpm;
  const measureStarts = [0];
  for (const measure of song.measures) measureStarts.push(measureStarts[measureStarts.length - 1] + measure.beats);
  const totalBeats = songDurationBeats(song);

  let fixed: TempoSegment[] = [open(startAt, 0, baseSpb)];
  let committed = -Infinity;
  let pending: TempoChange[] = [];
  let loop: LoopState | null = null;

  /** Aplica as mudanças e os saltos com instante ≤ until, sem tocar no estado. */
  const project = (until: number): Projection => {
    const segments = fixed.slice(0, -1);
    segments.push({ ...fixed[fixed.length - 1] });
    const queue = pending.slice();
    const state = loop && { ...loop };
    for (;;) {
      const current = segments[segments.length - 1];
      const tempoAt = queue.length ? queue[0].time : Infinity;
      const jumpAt = state ? current.time + (state.jumpBeat - current.beat) * current.spb : Infinity;
      if (!(Math.min(tempoAt, jumpAt) <= until)) break;
      if (state && jumpAt <= tempoAt) {
        current.endTime = jumpAt;
        current.endBeat = state.jumpBeat;
        segments.push(open(jumpAt, state.startBeat, current.spb));
        state.jumpBeat = state.endBeat;
      } else {
        const change = queue.shift()!;
        const beat = beatIn(current, change.time);
        current.endTime = change.time;
        current.endBeat = beat;
        segments.push(open(change.time, beat, change.spb));
      }
    }
    return { segments, pending: queue, loop: state };
  };

  const commit = (until: number) => {
    if (!(until > committed)) return;
    const next = project(until);
    fixed = next.segments;
    pending = next.pending;
    loop = next.loop;
    committed = until;
  };

  const segmentsUntil = (until: number) => (until <= committed ? fixed : project(until).segments);

  const committedBeat = () => (committed === -Infinity ? -Infinity : beatIn(fixed[fixed.length - 1], committed));

  const spansOf = (segments: readonly TempoSegment[], from: number, to: number): TimelineSpan[] => {
    const out: TimelineSpan[] = [];
    for (let i = segmentIndexAt(segments, from); i < segments.length; i++) {
      const segment = segments[i];
      if (segment.time > to) break;
      const fromBeat = Math.max(segment.beat, beatIn(segment, from));
      const toBeat = Math.min(segment.endBeat, beatIn(segment, to));
      if (toBeat >= fromBeat) out.push({ time: segment.time, beat: segment.beat, spb: segment.spb, fromBeat, toBeat });
    }
    return out;
  };

  return {
    startAt,
    bpm,
    get committed() {
      return committed;
    },
    get loop() {
      return loop?.range ?? null;
    },
    setTempo(factor, at) {
      if (!(factor >= MIN_TEMPO_FACTOR && factor <= MAX_TEMPO_FACTOR)) throw new RangeError(`fator de andamento inválido: ${factor}`);
      if (!Number.isFinite(at)) throw new RangeError(`instante inválido: ${at}`);
      const time = Math.max(at, committed);
      pending = pending.filter((change) => change.time < time);
      pending.push({ time, spb: baseSpb / factor });
      return time;
    },
    setLoop(range) {
      if (range === null) {
        loop = null;
        return committed;
      }
      const { startMeasure, endMeasure } = range;
      const count = song.measures.length;
      if (!Number.isInteger(startMeasure) || !Number.isInteger(endMeasure) || startMeasure < 0 || endMeasure >= count || startMeasure > endMeasure) {
        throw new RangeError(`laço inválido: ${startMeasure}–${endMeasure} de ${count} compassos`);
      }
      const startBeat = measureStarts[startMeasure];
      const endBeat = measureStarts[endMeasure + 1];
      const now = committedBeat();
      const jumpBeat = now <= endBeat ? endBeat : (measureStarts.find((beat) => beat > now) ?? Math.max(now, totalBeats));
      loop = { range: { startMeasure, endMeasure }, startBeat, endBeat, jumpBeat };
      return committed;
    },
    beatAt(t) {
      const segments = segmentsUntil(t);
      return beatIn(segments[segmentIndexAt(segments, t)], t);
    },
    segments: (until) => segmentsUntil(until).map((segment) => ({ ...segment })),
    spans: (from, to) => spansOf(segmentsUntil(to), from, to),
    cursor(from) {
      let index = segmentIndexAt(segmentsUntil(from), from);
      let beat = beatIn(segmentsUntil(from)[index], from);
      let last = from;
      return {
        advance(to) {
          if (!(to > last)) return [];
          last = to;
          commit(to);
          const out: TimelineSpan[] = [];
          for (;;) {
            const segment = fixed[index];
            if (to < segment.endTime) {
              let toBeat = beatIn(segment, to);
              // O instante do salto é arredondado: sem o teto, o primeiro tempo depois de B escaparia antes do salto.
              if (index === fixed.length - 1 && loop) toBeat = Math.min(toBeat, loop.jumpBeat);
              if (toBeat > beat) out.push({ time: segment.time, beat: segment.beat, spb: segment.spb, fromBeat: beat, toBeat });
              if (toBeat > beat) beat = toBeat;
              return out;
            }
            if (segment.endBeat > beat) {
              out.push({ time: segment.time, beat: segment.beat, spb: segment.spb, fromBeat: beat, toBeat: segment.endBeat });
            }
            index++;
            beat = fixed[index].beat;
          }
        },
      };
    },
  };
}

/** Quem começa nos tempos [fromBeat, toBeat) (ou [fromBeat, toBeat] com `inclusive`), de uma lista em ordem de tempo. */
export function between<T extends { beat: number }>(items: readonly T[], fromBeat: number, toBeat: number, inclusive = false): T[] {
  let lo = 0;
  let hi = items.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].beat < fromBeat) lo = mid + 1;
    else hi = mid;
  }
  const out: T[] = [];
  for (let i = lo; i < items.length && (items[i].beat < toBeat || (inclusive && items[i].beat === toBeat)); i++) out.push(items[i]);
  return out;
}

export function timeIn(span: Pick<TimelineSpan, 'time' | 'beat' | 'spb'>, beat: number): number {
  return span.time + (beat - span.beat) * span.spb;
}
