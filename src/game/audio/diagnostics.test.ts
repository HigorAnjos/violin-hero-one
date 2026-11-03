import { describe, expect, it } from 'vitest';
import {
  createLiveStats,
  formatReport,
  MIN_STEADY_READINGS,
  oboeSignals,
  OBOE_LIMITS,
  readInput,
  soundToJudgmentMs,
  type DiagnosedAudio,
  type InputReport,
  type LiveSnapshot,
} from './diagnostics';
import { PitchTracker } from './pitch/tracker';
import { DEFAULT_SAMPLE_RATE, tone } from './testing/synth';
import type { PitchReading } from './types';

function audioWith(settings: Record<string, unknown>, context: Partial<DiagnosedAudio['context']> = {}): DiagnosedAudio {
  return {
    label: 'Microfone interno',
    context: { sampleRate: 48000, state: 'running', baseLatency: 0.01, outputLatency: 0.03, ...context },
    stream: { getAudioTracks: () => [{ label: 'x', getSettings: () => settings }] as unknown as MediaStreamTrack[] },
  };
}

const SUPPORTED = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

/** Leituras do PitchTracker de verdade sobre um tom gerado, com o relógio do bloco em que a janela fechou. */
function readingsOf(signal: Float32Array, sampleRate = DEFAULT_SAMPLE_RATE): PitchReading[] {
  const tracker = new PitchTracker({ sampleRate, a4: 442 });
  const stream = tracker.createWindow();
  const out: PitchReading[] = [];
  const block = 128;
  for (let start = 0; start < signal.length; start += block) {
    stream.push(signal.subarray(start, start + block), (window, end) => {
      const r = tracker.analyse(window, (start + end) / sampleRate);
      if (r) out.push(r);
    });
  }
  return out;
}

describe('readInput', () => {
  it('pedido cru respeitado: tudo desligado, taxas e latências em ms', () => {
    const input = readInput(
      audioWith({ echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000, channelCount: 1, latency: 0.01 }),
      SUPPORTED
    );
    expect(input.applied).toEqual({ echoCancellation: 'off', noiseSuppression: 'off', autoGainControl: 'off' });
    expect(input.ignored).toEqual([]);
    expect(input).toMatchObject({ label: 'Microfone interno', trackSampleRate: 48000, channelCount: 1, contextSampleRate: 48000, contextState: 'running' });
    expect(input.trackLatencyMs).toBeCloseTo(10);
    expect(input.baseLatencyMs).toBeCloseTo(10);
    expect(input.outputLatencyMs).toBeCloseTo(30);
  });

  it('WebView que ignora: o que segue ligado e o que nem informa (iOS sem outputLatency)', () => {
    const input = readInput(audioWith({ echoCancellation: false, noiseSuppression: true }, { outputLatency: undefined }), { echoCancellation: true });
    expect(input.applied).toEqual({ echoCancellation: 'off', noiseSuppression: 'on', autoGainControl: 'unknown' });
    expect(input.ignored).toEqual(['noiseSuppression']);
    expect(input.supported).toEqual({ echoCancellation: true, noiseSuppression: false, autoGainControl: false });
    expect(input.outputLatencyMs).toBeNull();
    expect(input.trackSampleRate).toBeNull();
  });
});

describe('createLiveStats com áudio gerado', () => {
  it('Lá solta firme: estabilidade bem abaixo do limite; atraso medido pelo relógio de chegada', () => {
    const readings = readingsOf(tone({ frequency: 442, durationSec: 1.5, noise: 0.01 }));
    const stats = createLiveStats();
    // Cada leitura chega 12 ms depois da amostra analisada; a última, 40 ms (um soluço)
    readings.forEach((r, i) => stats.push(r, r.time + (i === readings.length - 1 ? 0.04 : 0.012)));
    stats.level(-20);
    const live = stats.snapshot();
    expect(live.reading?.midi).toBe(69);
    expect(live.level).toBe(-20);
    expect(live.steadiness?.midi).toBe(69);
    expect(live.steadiness!.count).toBeGreaterThanOrEqual(MIN_STEADY_READINGS);
    expect(live.steadiness!.spreadCents).toBeLessThan(1);
    expect(live.lag!.p95Ms).toBeCloseTo(12, 5);
    expect(live.lag!.meanMs).toBeGreaterThan(12);
  });

  it('nota que oscila (como com supressão de ruído brigando com o arco) passa do limite', () => {
    const readings = readingsOf(tone({ frequency: 442, durationSec: 1.5, vibrato: { depthCents: 12, rateHz: 3 } }));
    const stats = createLiveStats();
    readings.forEach((r) => stats.push(r, r.time + 0.01));
    expect(stats.snapshot().steadiness!.spreadCents).toBeGreaterThan(OBOE_LIMITS.spreadCents);
  });

  it('o silêncio zera a nota sustentada; troca de nota recomeça a conta', () => {
    const stats = createLiveStats();
    const a = readingsOf(tone({ frequency: 442, durationSec: 0.6 }));
    const e = readingsOf(tone({ frequency: 663, durationSec: 0.2 }));
    a.forEach((r) => stats.push(r, r.time));
    expect(stats.snapshot().steadiness).not.toBeNull();
    // Poucas leituras na nota nova: a estabilidade do Lá não continua valendo para o Mi
    e.slice(0, MIN_STEADY_READINGS - 1).forEach((r) => stats.push({ ...r, time: r.time + 1 }, r.time + 1));
    expect(stats.snapshot().reading?.midi).toBe(76);
    expect(stats.snapshot().steadiness).toBeNull();
    stats.push(null, 2);
    expect(stats.snapshot()).toMatchObject({ reading: null, steadiness: null });
    stats.reset();
    expect(stats.snapshot()).toEqual({ level: null, reading: null, lag: null, steadiness: null });
  });
});

const clean = (): InputReport => readInput(audioWith({ echoCancellation: false, noiseSuppression: false, autoGainControl: false }), SUPPORTED);
const steadyLive = (p95Ms = 10, spreadCents = 1): LiveSnapshot => ({
  level: -25,
  reading: { time: 1, hz: 442, midi: 69, cents: 0.4, clarity: 0.98, level: -25 },
  lag: { meanMs: p95Ms - 2, p95Ms, count: 100 },
  steadiness: { midi: 69, spreadCents, count: 40 },
});
const calibrated = (latencyMs: number) => ({ latencyMs, confidence: 0.9, measuredAt: '2026-11-03T10:00:00.000Z' });

describe('oboeSignals', () => {
  it('WebView dentro dos limites: nenhum sinal', () => {
    // 60 ms de ida e volta − 30 de saída = 30 de entrada, + 10 da detecção = 40 ms
    expect(soundToJudgmentMs(clean(), steadyLive(), calibrated(60))).toBe(40);
    expect(oboeSignals(clean(), steadyLive(), calibrated(60))).toEqual([]);
  });

  it('cada limite estourado vira um sinal com o número medido', () => {
    const input = readInput(audioWith({ echoCancellation: false, noiseSuppression: true, autoGainControl: true }), SUPPORTED);
    const signals = oboeSignals(input, steadyLive(35, 4), calibrated(180));
    expect(signals).toEqual([
      expect.stringContaining('não desliga noiseSuppression, autoGainControl'),
      expect.stringContaining('ida e volta calibrada de 180 ms'),
      expect.stringContaining('som→julgamento estimado em 185 ms'),
      expect.stringContaining('p95 de 35.0 ms'),
      expect.stringContaining('±4.0 cents'),
    ]);
  });

  it('sem calibração ou sem outputLatency não estima o som→julgamento', () => {
    expect(soundToJudgmentMs(clean(), steadyLive(), null)).toBeNull();
    const ios = readInput(audioWith({}, { outputLatency: undefined }), {});
    expect(soundToJudgmentMs(ios, steadyLive(), calibrated(60))).toBeNull();
  });
});

describe('formatReport', () => {
  it('uma linha por medida, pronto para colar', () => {
    const text = formatReport({
      when: new Date('2026-11-03T10:00:00Z'),
      app: '0.1.0 · android 1.0 (1)',
      device: 'Mozilla/5.0 (Linux; Android 14)',
      input: clean(),
      live: steadyLive(),
      calibrated: calibrated(60),
      a4: 442,
    });
    expect(text.split('\n')).toEqual(
      expect.arrayContaining([
        'Violin Hero · diagnóstico de áudio',
        'quando: 2026-11-03T10:00:00.000Z',
        'app: 0.1.0 · android 1.0 (1)',
        'pedido: echoCancellation=false noiseSuppression=false autoGainControl=false',
        'aplicado: echoCancellation=desligado noiseSuppression=desligado autoGainControl=desligado',
        'ignorado pelo WebView: nenhum',
        'latência: base 10.0 ms · saída 30.0 ms · entrada (faixa) não informado',
        'nota: A4 442.0 Hz +0.4 cents · clareza 0.98',
        'atraso da detecção: média 8.0 ms · p95 10.0 ms (n=100)',
        'som→julgamento estimado: 40 ms',
        'sinais de Oboe: nenhum',
      ])
    );
  });

  it('microfone fechado: só o que dá para saber sem ele', () => {
    const text = formatReport({
      when: new Date(0),
      app: 'web',
      device: 'x',
      input: null,
      live: { level: null, reading: null, lag: null, steadiness: null },
      calibrated: null,
      a4: 440,
    });
    expect(text).toContain('microfone: fechado');
    expect(text).toContain('calibração guardada: nenhuma');
    expect(text).not.toContain('sinais de Oboe');
  });
});
