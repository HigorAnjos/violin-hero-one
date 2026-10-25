import { describe, it, expect, vi } from 'vitest';
import type { Microphone, PitchListener } from '../game/audio';
import { reading } from './fakeEar';
import { createMicrophoneEar, type MicrophoneEarDeps } from './microphoneEar';

function fakeDeps() {
  const mic = { context: {}, source: {}, stream: {}, label: 'mic', stop: vi.fn().mockResolvedValue(undefined) } as unknown as Microphone;
  let pitchOut: PitchListener = () => undefined;
  let levelOut: (db: number) => void = () => undefined;
  const pitchStop = vi.fn().mockResolvedValue(undefined);
  const levelStop = vi.fn();
  const deps = {
    openMicrophone: vi.fn().mockResolvedValue(mic),
    startPitch: vi.fn(async (_source: unknown, listener: PitchListener) => {
      pitchOut = listener;
      return { stop: pitchStop };
    }),
    startLevelMeter: vi.fn((_c: unknown, _s: unknown, listener: (db: number) => void) => {
      levelOut = listener;
      return { stop: levelStop };
    }),
  };
  return {
    deps: deps as unknown as MicrophoneEarDeps,
    spies: deps,
    mic,
    pitchStop,
    levelStop,
    emitPitch: (r: Parameters<PitchListener>[0]) => pitchOut(r),
    emitLevel: (db: number) => levelOut(db),
  };
}

describe('createMicrophoneEar', () => {
  it('abre o microfone e liga afinação e nível na mesma fonte', async () => {
    const f = fakeDeps();
    const ear = createMicrophoneEar(f.deps);
    await ear.start();
    expect(f.spies.startPitch).toHaveBeenCalledWith(f.mic.source, expect.any(Function));
    expect(f.spies.startLevelMeter).toHaveBeenCalledWith(f.mic.context, f.mic.source, expect.any(Function));
  });

  it('start repetido reaproveita o microfone aberto', async () => {
    const f = fakeDeps();
    const ear = createMicrophoneEar(f.deps);
    await Promise.all([ear.start(), ear.start()]);
    await ear.start();
    expect(f.spies.openMicrophone).toHaveBeenCalledOnce();
  });

  it('repassa leituras e nível a quem escuta, até cancelar', async () => {
    const f = fakeDeps();
    const ear = createMicrophoneEar(f.deps);
    const onPitch = vi.fn();
    const onLevel = vi.fn();
    const offPitch = ear.onPitch(onPitch);
    ear.onLevel(onLevel);
    await ear.start();
    f.emitPitch(reading(69, 1));
    f.emitLevel(-30);
    offPitch();
    f.emitPitch(null);
    expect(onPitch).toHaveBeenCalledOnce();
    expect(onLevel).toHaveBeenCalledWith(-30);
  });

  it('recusa do navegador sobe como erro e o próximo start pede de novo', async () => {
    const f = fakeDeps();
    f.spies.openMicrophone.mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'));
    const ear = createMicrophoneEar(f.deps);
    await expect(ear.start()).rejects.toMatchObject({ name: 'NotAllowedError' });
    await ear.start();
    expect(f.spies.openMicrophone).toHaveBeenCalledTimes(2);
  });

  it('falha ao ligar a afinação fecha o microfone aberto', async () => {
    const f = fakeDeps();
    f.spies.startPitch.mockRejectedValueOnce(new DOMException('x', 'InvalidStateError'));
    const ear = createMicrophoneEar(f.deps);
    await expect(ear.start()).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(f.mic.stop).toHaveBeenCalledOnce();
  });

  it('stop desliga nível, afinação e microfone', async () => {
    const f = fakeDeps();
    const ear = createMicrophoneEar(f.deps);
    await ear.start();
    ear.stop();
    await vi.waitFor(() => expect(f.mic.stop).toHaveBeenCalledOnce());
    expect(f.levelStop).toHaveBeenCalledOnce();
    expect(f.pitchStop).toHaveBeenCalledOnce();
  });
});
