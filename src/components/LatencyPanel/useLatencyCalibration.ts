import React from 'react';
import { audioDeviceKey, latencySeconds, loadLatency, startCalibration, type CalibrationHandle, type CalibrationResult } from '../../game/audio';
import type { EarAudio } from '../../shell/Ear';

export type CalibrationPhase =
  | { kind: 'idle' }
  | { kind: 'counting'; count: number }
  | { kind: 'measuring'; beat: number; total: number; heard: number }
  | { kind: 'done'; result: CalibrationResult }
  | { kind: 'failed' };

export interface LatencyCalibration {
  phase: CalibrationPhase;
  /** Par entrada>saída do áudio aberto; null antes de abrir. */
  deviceKey: string | null;
  /** A latência que vai para o motor: a calibrada deste par, ou o padrão. */
  seconds: number;
  /** Este par já tem medida no aparelho. */
  measured: boolean;
  start(): void;
}

const IDLE: CalibrationPhase = { kind: 'idle' };

/** Calibra a latência pelo Ouvido (startCalibration grava o resultado confiável no aparelho). */
export function useLatencyCalibration(audio: EarAudio | null, a4: number, onReliable: (seconds: number) => void): LatencyCalibration {
  // A fase vale para o áudio em que a medida começou: microfone reaberto (contexto novo) volta a "parado"
  const [run, setRun] = React.useState<{ audio: EarAudio | null; phase: CalibrationPhase }>({ audio: null, phase: IDLE });
  const handle = React.useRef<CalibrationHandle | null>(null);
  const reliable = React.useRef(onReliable);
  React.useEffect(() => {
    reliable.current = onReliable;
  });
  const deviceKey = audio ? audioDeviceKey(audio.stream ?? undefined, audio.context) : null;

  React.useEffect(
    () => () => {
      void handle.current?.cancel();
      handle.current = null;
    },
    [audio]
  );

  const start = React.useCallback(() => {
    if (!audio || !deviceKey) return;
    void handle.current?.cancel();
    const set = (phase: CalibrationPhase) => setRun({ audio, phase });
    let heard = 0;
    let countIn = 0;
    let beats = 0;
    set({ kind: 'counting', count: 0 });
    startCalibration(audio.source, {
      a4,
      deviceKey,
      onEvent: (event) => {
        if (event.type === 'scheduled') {
          countIn = event.schedule.countIn.length;
          beats = event.schedule.beats.length;
          set({ kind: 'counting', count: countIn });
        } else if (event.type === 'click' && event.countIn) set({ kind: 'counting', count: countIn - event.index });
        else if (event.type === 'click') set({ kind: 'measuring', beat: event.index + 1, total: beats, heard });
        else if (event.type === 'sample' && event.sample.status === 'hit') heard += 1;
        else if (event.type === 'done') {
          set({ kind: 'done', result: event.result });
          if (event.result.reliable && event.result.latencySeconds !== null) reliable.current(event.result.latencySeconds);
        }
      },
    })
      .then((h) => {
        handle.current = h;
        h.result.catch(() => undefined);
      })
      .catch(() => set({ kind: 'failed' }));
  }, [audio, a4, deviceKey]);

  const running = run.phase.kind === 'counting' || run.phase.kind === 'measuring';
  return {
    phase: running && run.audio !== audio ? IDLE : run.phase,
    deviceKey,
    seconds: deviceKey ? latencySeconds(deviceKey) : latencySeconds(),
    measured: deviceKey !== null && loadLatency(deviceKey) !== null,
    start,
  };
}
