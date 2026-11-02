import { describe, expect, it, vi } from 'vitest';
import {
  RECORDING_BITS_PER_SECOND,
  RECORDING_TIMESLICE_MS,
  RecordingError,
  pickRecordingFormat,
  startRecording,
  type RecordingFormat,
} from './recorder';
import type { MicCloseReason } from './session';

/** MediaRecorder de mentira: entrega um pedaço de bytes por segundo de "som" a cada requestData/stop. */
class FakeMediaRecorder extends EventTarget {
  static created: FakeMediaRecorder[] = [];
  state: RecordingState = 'inactive';
  timeslice: number | undefined;
  readonly mimeType: string;
  constructor(
    readonly stream: MediaStream,
    readonly options: MediaRecorderOptions = {},
  ) {
    super();
    this.mimeType = options.mimeType ?? '';
    FakeMediaRecorder.created.push(this);
  }
  start(timeslice?: number) {
    this.timeslice = timeslice;
    this.state = 'recording';
  }
  pause() {
    this.state = 'paused';
  }
  resume() {
    this.state = 'recording';
  }
  /** O que o codificador soltaria em `seconds` de som, no bitrate pedido. */
  emit(seconds: number) {
    const bytes = Math.round(((this.options.audioBitsPerSecond ?? 0) / 8) * seconds);
    const event = new Event('dataavailable') as BlobEvent;
    Object.defineProperty(event, 'data', { value: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
    this.dispatchEvent(event);
  }
  stop() {
    this.state = 'inactive';
    // O navegador entrega o último pedaço e depois o stop, fora da chamada
    queueMicrotask(() => {
      this.emit(0.5);
      this.dispatchEvent(new Event('stop'));
    });
  }
}

const WEBM: RecordingFormat = { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: RECORDING_BITS_PER_SECOND };

function setup(format: RecordingFormat | null = WEBM) {
  FakeMediaRecorder.created = [];
  const track = { stop: vi.fn() };
  const destination = { channelCount: 2, channelCountMode: 'max', channelInterpretation: 'discrete', stream: { getTracks: () => [track] } };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = { createMediaStreamDestination: vi.fn(() => destination) };
  const closeListeners = new Set<(reason: MicCloseReason) => void>();
  let open = true;
  const session = {
    audio: () => (open ? ({ context, source, stream: {}, label: 'mic' } as never) : null),
    onClose: (l: (reason: MicCloseReason) => void) => {
      closeListeners.add(l);
      return () => void closeListeners.delete(l);
    },
  };
  let clock = 0;
  const make = () =>
    startRecording(session, { MediaRecorder: FakeMediaRecorder as never, format, now: () => clock });
  return {
    make,
    destination,
    source,
    track,
    closeListeners,
    media: () => FakeMediaRecorder.created[FakeMediaRecorder.created.length - 1],
    advance: (ms: number) => (clock += ms),
    closeMic: (reason: MicCloseReason) => closeListeners.forEach((l) => l(reason)),
    noMic: () => (open = false),
  };
}

describe('pickRecordingFormat', () => {
  it('prefere Opus no WebM quando o navegador grava os dois', () => {
    expect(pickRecordingFormat(() => true)).toEqual({ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48_000 });
  });

  it('cai no MP4 no Safari', () => {
    expect(pickRecordingFormat((type) => type === 'audio/mp4')?.mimeType).toBe('audio/mp4');
  });

  it('sem formato da lista ou sem MediaRecorder, null', () => {
    expect(pickRecordingFormat((type) => type === 'audio/ogg')).toBeNull();
    expect(pickRecordingFormat(null)).toBeNull();
  });

  it('3 minutos no bitrate escolhido cabem em menos de 10 MB', () => {
    expect((RECORDING_BITS_PER_SECOND / 8) * 180).toBeLessThan(10 * 1024 * 1024);
  });
});

describe('startRecording', () => {
  it('grava a fonte do microfone num destino mono, no formato escolhido, em pedaços de 1 s', () => {
    const f = setup();
    const recorder = f.make();
    expect(f.source.connect).toHaveBeenCalledWith(f.destination);
    expect(f.destination).toMatchObject({ channelCount: 1, channelCountMode: 'explicit', channelInterpretation: 'speakers' });
    expect(f.media().stream).toBe(f.destination.stream);
    expect(f.media().options).toEqual(WEBM);
    expect(f.media().timeslice).toBe(RECORDING_TIMESLICE_MS);
    expect(recorder.state).toBe('recording');
  });

  it('stop devolve o Blob com tudo o que veio, a duração e o tipo, e solta o destino', async () => {
    const f = setup();
    const recorder = f.make();
    f.advance(1000);
    f.media().emit(1);
    f.advance(1500);
    const recording = await recorder.stop();
    expect(recording.mimeType).toBe('audio/webm;codecs=opus');
    expect(recording.blob.type).toBe('audio/webm;codecs=opus');
    expect(recording.durationMs).toBe(2500);
    expect(recording.blob.size).toBe(6000 + 3000);
    expect(f.source.disconnect).toHaveBeenCalledWith(f.destination);
    expect(f.track.stop).toHaveBeenCalled();
    expect(f.closeListeners.size).toBe(0);
    expect(recorder.state).toBe('stopped');
  });

  it('3 minutos de música ficam abaixo de 10 MB', async () => {
    const f = setup();
    const recorder = f.make();
    for (let s = 0; s < 180; s++) {
      f.advance(1000);
      f.media().emit(1);
    }
    const { blob, durationMs } = await recorder.stop();
    expect(durationMs).toBe(180_000);
    expect(blob.size).toBeLessThan(10 * 1024 * 1024);
  });

  it('a pausa da partida pausa o MediaRecorder e não conta na duração', async () => {
    const f = setup();
    const recorder = f.make();
    f.advance(2000);
    recorder.pause();
    expect(f.media().state).toBe('paused');
    expect(recorder.state).toBe('paused');
    f.advance(30_000);
    recorder.pause();
    recorder.resume();
    expect(f.media().state).toBe('recording');
    f.advance(1000);
    expect((await recorder.stop()).durationMs).toBe(3000);
  });

  it('parar durante a pausa fecha com o que foi gravado antes dela', async () => {
    const f = setup();
    const recorder = f.make();
    f.advance(4000);
    recorder.pause();
    f.advance(10_000);
    expect((await recorder.stop()).durationMs).toBe(4000);
  });

  it('descartar (partida abandonada) para, joga fora e o stop recusa', async () => {
    const f = setup();
    const recorder = f.make();
    f.media().emit(1);
    recorder.discard();
    expect(f.media().state).toBe('inactive');
    await expect(recorder.stop()).rejects.toMatchObject({ kind: 'discarded' });
    expect(f.source.disconnect).toHaveBeenCalled();
    expect(f.closeListeners.size).toBe(0);
  });

  it('descartar depois do stop não mexe no que já saiu', async () => {
    const f = setup();
    const recorder = f.make();
    f.media().emit(1);
    const recording = await recorder.stop();
    recorder.discard();
    expect(recording.blob.size).toBe(9000);
  });

  it('o microfone fechou no meio (aba oculta): gravação interrompida, sem buraco no arquivo', async () => {
    const f = setup();
    const recorder = f.make();
    f.closeMic('hidden');
    expect(f.media().state).toBe('inactive');
    const error = await recorder.stop().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RecordingError);
    expect(error).toMatchObject({ kind: 'interrupted', reason: 'hidden' });
  });

  it('erro do MediaRecorder vira failed', async () => {
    const f = setup();
    const recorder = f.make();
    f.media().dispatchEvent(new Event('error'));
    await expect(recorder.stop()).rejects.toMatchObject({ kind: 'failed' });
  });

  it('sem microfone aberto ou sem formato, não começa', () => {
    const f = setup(null);
    expect(() => f.make()).toThrow(expect.objectContaining({ kind: 'unsupported' }));
    const g = setup();
    g.noMic();
    expect(() => g.make()).toThrow(expect.objectContaining({ kind: 'no-microphone' }));
  });
});
