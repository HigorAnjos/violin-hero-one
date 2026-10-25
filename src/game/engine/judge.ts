import type { PitchReading } from '../audio/types';
import { DEFAULT_TOLERANCE_CENTS, DEFAULT_WINDOWS } from './score';
import type { EngineNote, TimingWindows } from './types';

/** Leituras seguidas da mesma nota (~20 ms no passo de 10 ms) antes de valer como tocada. */
export const STABLE_READINGS = 3;
/**
 * Do início real da nota à primeira leitura dela: ~21 ms depois de silêncio, ~43 ms vindo de legato. A calibração
 * mede o próprio início do som, então só sobra descontar este atraso da janela de altura.
 */
export const DETECTION_LAG_SECONDS = 0.03;
/** Um ataque ainda desafinado na leitura estável pode assentar neste tempo e ainda acertar. */
export const SETTLE_SECONDS = 0.1;
/** As notas expiram este tanto depois da janela: travada da thread principal não pode virar erro na borda. */
export const EXPIRY_SLACK_SECONDS = 0.1;
/** Constante de tempo do nível lento com que o nível do passo é comparado; tremor e vibrato andam em cima dele. */
export const LEVEL_SLOW_SECONDS = 0.15;
/** Passo este tanto abaixo do nível lento arma uma troca de arco; um tremor de ±3 dB nunca chega lá. */
export const BOW_DIP_DB = 4;
/** Subir este tanto acima do fundo da queda, na mesma altura, é ataque novo (nota repetida com troca de arco). */
export const BOW_RISE_DB = 4;
/** Um null só separa dois ataques da mesma nota se as leituras pararam ao menos este tempo (arco arranhado falha ~50 ms). */
export const NEW_ATTACK_GAP_SECONDS = 0.06;
/** Trocas de arco só são procuradas este número de leituras (~120 ms) depois de um ataque. */
export const LEVEL_WARMUP_READINGS = 12;
/** Uma tentativa que não acertou é atribuída à nota aberta mais próxima até este tanto além da janela Bom. */
export const ATTEMPT_MARGIN_SECONDS = 0.25;
/** Desvio a partir do qual a nota ouvida é outra nota, e não a certa desafinada. */
export const WRONG_NOTE_CENTS = 75;

const LEVEL_ALPHA = 1 - Math.exp(-0.01 / LEVEL_SLOW_SECONDS);

export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

/** O que foi ouvido perto de uma nota que acabou errada; a de maior prioridade explica o erro. */
export interface Attempt {
  kind: 'timing' | 'tuning' | 'wrong';
  offsetMs: number;
  cents: number;
  playedMidi: number;
}

const ATTEMPT_PRIORITY: Record<Attempt['kind'], number> = { wrong: 1, tuning: 2, timing: 3 };

export type Verdict =
  | { kind: 'hit'; index: number; offsetMs: number; cents: number }
  | { kind: 'miss'; index: number; attempt: Attempt | null };

export interface JudgeOptions {
  windows?: TimingWindows;
  toleranceCents?: number;
  /** Segundos descontados de PitchReading.time: a latência calibrada. */
  latencySeconds?: number;
  detectionLagSeconds?: number;
}

export interface Judge {
  push(reading: PitchReading | null): void;
  advance(now: number): void;
  /** Desvio médio em cents de todas as leituras do som que acertou a nota; null se não acertou. */
  heldCents(index: number): number | null;
  readonly done: boolean;
}

/**
 * Cada ataque é uma sequência de leituras de uma nota, encerrada por uma pausa nas leituras, troca de nota ou troca
 * de arco (queda de nível e volta, mesma altura). Ele acerta no máximo uma nota: a mais antiga ainda aberta cuja
 * janela contém o ataque e cuja altura bate dentro da tolerância. Acertar uma nota erra as anteriores em aberto, então
 * os veredictos saem na ordem das notas.
 */
export function createJudge(notes: readonly EngineNote[], options: JudgeOptions, onVerdict: (v: Verdict) => void): Judge {
  const windows = options.windows ?? DEFAULT_WINDOWS;
  const tolerance = options.toleranceCents ?? DEFAULT_TOLERANCE_CENTS;
  const lag = options.detectionLagSeconds ?? DETECTION_LAG_SECONDS;
  const latency = options.latencySeconds ?? 0;
  const goodSeconds = windows.good / 1000;
  const attemptSeconds = goodSeconds + ATTEMPT_MARGIN_SECONDS;
  const judged: boolean[] = new Array(notes.length).fill(false);
  const attempts: (Attempt | null)[] = new Array(notes.length).fill(null);
  const heldSum: number[] = new Array(notes.length).fill(0);
  const heldCount: number[] = new Array(notes.length).fill(0);

  let firstOpen = 0;
  let runMidi = -1;
  let attackTime = 0;
  let runCount = 0;
  let runUsed = false;
  let runHit = -1;
  let slowLevel = 0;
  let dipping = false;
  let dipBottom = 0;
  let levelCount = 0;
  let candidateMidi = -1;
  let candidateStart = 0;
  let candidateCount = 0;
  let lastReading = -Infinity;
  let interrupted = false;

  function settle(verdict: Verdict): void {
    judged[verdict.index] = true;
    onVerdict(verdict);
  }

  function missBefore(index: number): void {
    for (; firstOpen < index; firstOpen++) {
      if (!judged[firstOpen]) settle({ kind: 'miss', index: firstOpen, attempt: attempts[firstOpen] });
    }
    while (firstOpen < notes.length && judged[firstOpen]) firstOpen++;
  }

  function recordAttempt(hitTime: number, reading: PitchReading): void {
    let nearest = -1;
    for (let i = firstOpen; i < notes.length; i++) {
      if (notes[i].time - hitTime > attemptSeconds) break;
      if (judged[i] || Math.abs(hitTime - notes[i].time) > attemptSeconds) continue;
      // Empate (até 1 ms) fica com a nota mais antiga: quem erra costuma estar atrasado.
      if (nearest < 0 || Math.abs(hitTime - notes[i].time) < Math.abs(hitTime - notes[nearest].time) - 0.001) nearest = i;
    }
    if (nearest < 0) return;
    const cents = centsBetween(reading.hz, notes[nearest].frequency);
    const distance = Math.abs(cents);
    const kind: Attempt['kind'] = distance <= tolerance ? 'timing' : distance < WRONG_NOTE_CENTS ? 'tuning' : 'wrong';
    const previous = attempts[nearest];
    if (previous && ATTEMPT_PRIORITY[previous.kind] >= ATTEMPT_PRIORITY[kind]) return;
    attempts[nearest] = { kind, offsetMs: (hitTime - notes[nearest].time) * 1000, cents, playedMidi: reading.midi };
  }

  function tryHit(reading: PitchReading): boolean {
    const hitTime = attackTime - latency;
    for (let i = firstOpen; i < notes.length; i++) {
      if (judged[i]) continue;
      if (notes[i].time - hitTime > goodSeconds) break;
      if (Math.abs(hitTime - notes[i].time) > goodSeconds) continue;
      const cents = centsBetween(reading.hz, notes[i].frequency);
      if (Math.abs(cents) > tolerance) continue;
      missBefore(i);
      runHit = i;
      heldSum[i] = cents;
      heldCount[i] = 1;
      settle({ kind: 'hit', index: i, offsetMs: (hitTime - notes[i].time) * 1000, cents });
      missBefore(i + 1);
      return true;
    }
    recordAttempt(hitTime, reading);
    return false;
  }

  function advance(now: number): void {
    const heard = now - lag - latency - EXPIRY_SLACK_SECONDS;
    let last = firstOpen;
    while (last < notes.length && heard - notes[last].time > goodSeconds) last++;
    missBefore(last);
  }

  function startAttack(time: number, count: number, level: number): void {
    attackTime = time;
    runCount = count;
    runUsed = false;
    runHit = -1;
    slowLevel = level;
    levelCount = 1;
    dipping = false;
  }

  function bowChanged(level: number): boolean {
    levelCount++;
    if (!dipping) {
      if (levelCount > LEVEL_WARMUP_READINGS && level < slowLevel - BOW_DIP_DB) {
        dipping = true;
        dipBottom = level;
        return false;
      }
      slowLevel += Math.max(LEVEL_ALPHA, 1 / levelCount) * (level - slowLevel);
      return false;
    }
    dipBottom = Math.min(dipBottom, level);
    return level - dipBottom >= BOW_RISE_DB;
  }

  function push(reading: PitchReading | null): void {
    if (firstOpen >= notes.length) return;
    if (!reading) {
      interrupted = true;
      return;
    }
    const gap = reading.time - lastReading;
    lastReading = reading.time;
    const resumed = interrupted;
    interrupted = false;
    if (resumed && gap >= NEW_ATTACK_GAP_SECONDS) {
      runMidi = reading.midi;
      candidateCount = 0;
      startAttack(reading.time - lag, 1, reading.level);
    } else if (reading.midi !== runMidi) {
      // Um ou dois saltos para a vizinha (ruído, histerese) não são troca de nota nem ataque novo.
      if (reading.midi !== candidateMidi || candidateCount === 0) {
        candidateMidi = reading.midi;
        candidateStart = reading.time;
        candidateCount = 0;
      }
      if (++candidateCount < STABLE_READINGS) {
        advance(reading.time);
        return;
      }
      runMidi = reading.midi;
      candidateCount = 0;
      startAttack(candidateStart - lag, STABLE_READINGS, reading.level);
    } else if (bowChanged(reading.level)) {
      candidateCount = 0;
      // O nível do passo não tem o atraso da janela: a subida aconteceu no último passo.
      startAttack(reading.time - 0.005, STABLE_READINGS, reading.level);
    } else {
      candidateCount = 0;
      runCount++;
      if (runHit >= 0) {
        heldSum[runHit] += centsBetween(reading.hz, notes[runHit].frequency);
        heldCount[runHit]++;
      }
    }
    if (!runUsed && runCount >= STABLE_READINGS) {
      if (tryHit(reading)) runUsed = true;
      else if (reading.time - (attackTime + lag) > SETTLE_SECONDS) runUsed = true;
    }
    advance(reading.time);
  }

  return {
    push,
    advance(now: number) {
      if (firstOpen < notes.length) advance(now);
    },
    heldCents(index: number) {
      return heldCount[index] > 0 ? heldSum[index] / heldCount[index] : null;
    },
    get done() {
      return firstOpen >= notes.length;
    },
  };
}
