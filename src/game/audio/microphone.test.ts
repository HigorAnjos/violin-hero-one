import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext } from './testing/web-audio';
import { RAW_AUDIO, micTrouble, openMicrophone } from './microphone';

class FakeTrack {
  stopped = false;
  constructor(readonly label = 'Microfone USB') {}
  stop(): void {
    this.stopped = true;
  }
}

function fakeStream(track = new FakeTrack()): MediaStream {
  return { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
}

let contexts: FakeAudioContext[];
let getUserMedia: ReturnType<typeof vi.fn>;

beforeEach(() => {
  contexts = [];
  getUserMedia = vi.fn(async () => fakeStream());
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
  vi.stubGlobal(
    'AudioContext',
    class extends FakeAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('openMicrophone', () => {
  it('pede áudio sem processamento e devolve o contexto rodando', async () => {
    const mic = await openMicrophone();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: RAW_AUDIO, video: false });
    expect(mic.context.state).toBe('running');
    expect((mic.context as unknown as FakeAudioContext).latencyHint).toBe('interactive');
    expect(mic.label).toBe('Microfone USB');
    expect((mic.source as unknown as { mediaStream: MediaStream }).mediaStream).toBe(mic.stream);
  });

  it('stop solta as trilhas e fecha o contexto', async () => {
    const track = new FakeTrack();
    getUserMedia.mockResolvedValueOnce(fakeStream(track));
    const mic = await openMicrophone();
    await mic.stop();
    expect(track.stopped).toBe(true);
    expect(mic.context.state).toBe('closed');
  });

  it('recusa fora de contexto seguro sem pedir permissão', async () => {
    vi.stubGlobal('isSecureContext', false);
    const error = await openMicrophone().catch((e: unknown) => e);
    expect(micTrouble(error)).toBe('insecure');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(0);
  });

  it('recusa navegador sem getUserMedia', async () => {
    vi.stubGlobal('navigator', {});
    expect(micTrouble(await openMicrophone().catch((e: unknown) => e))).toBe('unsupported');
  });

  it('fecha o contexto quando a permissão é negada', async () => {
    getUserMedia.mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'));
    expect(micTrouble(await openMicrophone().catch((e: unknown) => e))).toBe('denied');
    expect(contexts[0].state).toBe('closed');
  });

  it('solta o microfone e fecha o contexto quando o navegador não libera o áudio', async () => {
    const track = new FakeTrack();
    getUserMedia.mockResolvedValueOnce(fakeStream(track));
    vi.stubGlobal(
      'AudioContext',
      class extends FakeAudioContext {
        constructor(options?: AudioContextOptions) {
          super(options);
          contexts.push(this);
        }
        override async resume(): Promise<void> {}
      },
    );
    expect(micTrouble(await openMicrophone().catch((e: unknown) => e))).toBe('audio-blocked');
    expect(track.stopped).toBe(true);
    expect(contexts[0].state).toBe('closed');
  });
});

describe('micTrouble', () => {
  it.each([
    ['SecurityError', 'insecure'],
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'no-device'],
    ['OverconstrainedError', 'no-device'],
    ['NotReadableError', 'in-use'],
    ['AbortError', 'in-use'],
    ['InvalidStateError', 'audio-blocked'],
    ['NotSupportedError', 'unsupported'],
  ])('traduz %s em %s', (name, trouble) => {
    expect(micTrouble(new DOMException('x', name))).toBe(trouble);
  });

  it('cai em unknown para o resto', () => {
    expect(micTrouble(new Error('boom'))).toBe('unknown');
    expect(micTrouble('nope')).toBe('unknown');
  });
});

describe('RAW_AUDIO', () => {
  it('desliga o processamento de voz do navegador', () => {
    expect(RAW_AUDIO).toEqual({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  });
});
