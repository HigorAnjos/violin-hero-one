import { describe, it, expect, vi } from 'vitest';
import { createMicSession, type MicSessionDeps, type Microphone, type PitchListener, type VisibilitySource } from '../game/audio';
import { reading } from './fakeEar';
import { createMicrophoneEar } from './microphoneEar';

function setup() {
  const mic = { context: {}, source: {}, stream: {}, label: 'mic', stop: vi.fn().mockResolvedValue(undefined) } as unknown as Microphone;
  let pitchOut: PitchListener = () => undefined;
  let allow: (m: Microphone) => void = () => undefined;
  const deps = {
    openMicrophone: vi.fn().mockResolvedValue(mic),
    startPitch: vi.fn(async (_s: unknown, listener: PitchListener) => {
      pitchOut = listener;
      return { context: {}, a4: 442, setA4: vi.fn(), stop: vi.fn().mockResolvedValue(undefined) };
    }),
    startLevelMeter: vi.fn(() => ({ stop: vi.fn() })),
  };
  const visibility = { listener: () => undefined as void, state: 'visible' as DocumentVisibilityState };
  const doc: VisibilitySource = {
    get visibilityState() {
      return visibility.state;
    },
    addEventListener: (_t, l) => void (visibility.listener = l),
    removeEventListener: () => undefined,
  };
  const ear = createMicrophoneEar(createMicSession({ deps: deps as unknown as MicSessionDeps, document: doc }));
  return {
    ear,
    deps,
    mic,
    emitPitch: (r: Parameters<PitchListener>[0]) => pitchOut(r),
    holdPermission: () => deps.openMicrophone.mockImplementationOnce(() => new Promise<Microphone>((resolve) => (allow = resolve))),
    allow: () => allow(mic),
    hide: () => {
      visibility.state = 'hidden';
      visibility.listener();
    },
  };
}

describe('createMicrophoneEar', () => {
  it('start abre a sessão e expõe relógio e fonte; start repetido reaproveita', async () => {
    const f = setup();
    await Promise.all([f.ear.start(), f.ear.start()]);
    await f.ear.start();
    expect(f.deps.openMicrophone).toHaveBeenCalledOnce();
    expect(f.ear.audio()).toMatchObject({ context: f.mic.context, source: f.mic.source });
  });

  it('repassa leituras a quem escuta', async () => {
    const f = setup();
    const onPitch = vi.fn();
    f.ear.onPitch(onPitch);
    await f.ear.start();
    f.emitPitch(reading(69, 1));
    expect(onPitch).toHaveBeenCalledOnce();
  });

  it('stop durante a permissão: start termina sem erro e o microfone fecha ao chegar', async () => {
    const f = setup();
    f.holdPermission();
    const pending = f.ear.start();
    f.ear.stop();
    f.allow();
    await expect(pending).resolves.toBeUndefined();
    await vi.waitFor(() => expect(f.mic.stop).toHaveBeenCalledOnce());
    expect(f.ear.audio()).toBeNull();
  });

  it('recusa do navegador sobe como erro', async () => {
    const f = setup();
    f.deps.openMicrophone.mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'));
    await expect(f.ear.start()).rejects.toMatchObject({ name: 'NotAllowedError' });
  });

  it('aba oculta avisa onClosed com "hidden"; stop avisa com "stopped"', async () => {
    const f = setup();
    const onClosed = vi.fn();
    f.ear.onClosed(onClosed);
    await f.ear.start();
    f.hide();
    expect(onClosed).toHaveBeenLastCalledWith('hidden');
    await f.ear.start();
    f.ear.stop();
    expect(onClosed).toHaveBeenLastCalledWith('stopped');
  });
});
