import React from 'react';
import { audioDeviceKey, latencySeconds, type PitchReading } from '../game/audio';
import { scheduleClicks } from '../game/audio/latency/click';
import { createDictation, type DictatedNote, type DictationGrid } from '../game/notation/dictation';
import type { EditorMeta } from '../game/notation/editor';
import { countIn } from '../game/synth';
import { loadA4 } from '../services/playerAudio';
import { micFailure, useEar, type MicProblem } from './Ear';
import { loadMetronome } from './metronome';
import type { MicTrouble } from '../game/audio';

/** Folga entre o microfone aberto e o primeiro clique da contagem. */
const LEAD_SECONDS = 0.15;
/** De quanto em quanto a tela olha o relógio (contagem) e agenda o metrônomo. */
const TICK_MS = 50;
/** Metrônomo agendado até este tanto à frente. */
const METRONOME_AHEAD_SECONDS = 1;
/** A nota que soa na tela muda no máximo a cada este tanto (as leituras chegam a cada 10 ms). */
const LIVE_EVERY_SECONDS = 0.08;

export type DictationPhase =
  | { status: 'idle' }
  | { status: 'opening' }
  /** `count`: quantos tempos faltam (N … 1). */
  | { status: 'counting'; count: number }
  | { status: 'recording' };

/** A nota que o Ouvido está ouvindo agora, para o painel. */
export interface LiveNote {
  midi: number;
  hz: number;
  cents: number;
}

export interface DictationStart {
  meta: Pick<EditorMeta, 'bpm' | 'timeSignature'>;
  /** Onde o ditado entra na partitura, em semínimas (dictationOrigin). */
  origin: number;
  grid: DictationGrid;
}

export interface DictationDeps {
  clicks?: typeof scheduleClicks;
}

export interface DictationHandlers {
  /** Cada nota que fecha, já na grade: a tela manda para o editor. */
  onNote(note: DictatedNote, origin: number): void;
  /** O microfone não abriu: a tela de problema e a causa. */
  onTrouble(problem: MicProblem, cause: MicTrouble): void;
  /** Parou (botão, Esc ou microfone fechado): quantas notas entraram. */
  onDone(notes: number): void;
}

interface Running {
  stop(): void;
}

/**
 * Ditar tocando: abre o microfone (só quando a pessoa começa), conta um compasso com o clique do metrônomo, e manda
 * cada nota que o Ouvido fecha para o editor até a pessoa parar. Com metrônomo ligado nas Configurações, o clique
 * segue durante o ditado (com fone, ele não entra no microfone).
 */
export function useDictation(handlers: DictationHandlers, deps: DictationDeps = {}) {
  const ear = useEar();
  const [phase, setPhase] = React.useState<DictationPhase>({ status: 'idle' });
  const [live, setLive] = React.useState<LiveNote | null>(null);
  const running = React.useRef<Running | null>(null);
  const latest = React.useRef(handlers);
  React.useEffect(() => {
    latest.current = handlers;
  });
  const clicks = deps.clicks ?? scheduleClicks;

  const stop = React.useCallback(() => running.current?.stop(), []);

  const start = React.useCallback(
    async ({ meta, origin, grid }: DictationStart) => {
      if (running.current) return;
      let cancelled = false;
      const cleanups: (() => void)[] = [];
      let notes = 0;
      let finish: () => void = () => undefined;
      const run: Running = {
        stop: () => {
          cancelled = true;
          finish();
        },
      };
      running.current = run;
      const end = () => {
        cleanups.splice(0).forEach((c) => c());
        if (running.current === run) running.current = null;
        setPhase({ status: 'idle' });
        setLive(null);
      };
      finish = () => {
        end();
        latest.current.onDone(notes);
      };
      setPhase({ status: 'opening' });

      try {
        await ear.start();
      } catch (error) {
        end();
        const { problem, cause } = micFailure(error);
        latest.current.onTrouble(problem, cause);
        return;
      }
      const audio = ear.audio();
      if (cancelled || !audio) {
        end();
        if (!cancelled) latest.current.onDone(0);
        return;
      }

      ear.setA4(loadA4());
      const context = audio.context;
      const latency = latencySeconds(audioDeviceKey(audio.stream ?? undefined, context));
      const spb = 60 / meta.bpm;
      const barSeconds = meta.timeSignature.beats * spb;
      const startAt = context.currentTime + LEAD_SECONDS + barSeconds;
      const beats = countIn(meta, { startAt });
      cleanups.push(clicks(context, beats.map((b) => b.time)));

      const dictation = createDictation({ ...meta, startAt, latencySeconds: latency, grid });
      const send = (out: DictatedNote[]) => {
        for (const note of out) {
          notes += 1;
          latest.current.onNote(note, origin);
        }
      };
      let shownAt = -Infinity;
      let shown: number | null = null;
      cleanups.push(
        ear.onPitch((reading: PitchReading | null) => {
          send(dictation.push(reading));
          if (!reading) {
            shown = null;
            setLive(null);
          } else if (reading.midi !== shown || reading.time - shownAt >= LIVE_EVERY_SECONDS) {
            shown = reading.midi;
            shownAt = reading.time;
            setLive({ midi: reading.midi, hz: reading.hz, cents: reading.cents });
          }
        }),
      );
      cleanups.push(ear.onClosed(() => run.stop()));

      const volume = loadMetronome();
      let gain: GainNode | null = null;
      let ticksUntil = startAt;
      const tick = () => {
        const now = context.currentTime;
        if (now < startAt) {
          const left = beats.filter((b) => b.time > now).length;
          setPhase((p) => (p.status === 'counting' && p.count === left ? p : { status: 'counting', count: Math.max(1, left) }));
          return;
        }
        setPhase((p) => (p.status === 'recording' ? p : { status: 'recording' }));
        if (volume <= 0 || now + METRONOME_AHEAD_SECONDS <= ticksUntil) return;
        const until = now + 2 * METRONOME_AHEAD_SECONDS;
        const times: number[] = [];
        for (let k = Math.ceil((ticksUntil - startAt) / spb - 1e-6); startAt + k * spb < until; k++) times.push(startAt + k * spb);
        ticksUntil = until;
        if (!gain) {
          gain = context.createGain();
          gain.gain.value = volume;
          gain.connect(context.destination);
          const node = gain;
          cleanups.push(() => node.disconnect());
        }
        cleanups.push(clicks(context, times, gain));
      };
      tick();
      const timer = setInterval(tick, TICK_MS);
      cleanups.push(() => clearInterval(timer));

      finish = () => {
        send(dictation.finish(context.currentTime));
        end();
        latest.current.onDone(notes);
      };
      if (cancelled) finish();
    },
    [ear, clicks],
  );

  // Sair da tela no meio do ditado: para sem avisar ninguém
  React.useEffect(
    () => () => {
      const run = running.current;
      running.current = null;
      if (run) {
        latest.current = { onNote: () => undefined, onTrouble: () => undefined, onDone: () => undefined };
        run.stop();
      }
    },
    [],
  );

  return { phase, live, start, stop };
}
