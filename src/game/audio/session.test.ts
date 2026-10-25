import { describe, expect, it, vi } from 'vitest';
import type { Microphone } from './microphone';
import { createMicSession, isMicClosed, type MicSessionDeps, type VisibilitySource } from './session';
import type { PitchListener, PitchReading } from './types';

function fakeMic(label = 'mic'): Microphone {
  return { context: { label }, source: { label }, stream: {}, label, stop: vi.fn().mockResolvedValue(undefined) } as unknown as Microphone;
}

function fakeDocument() {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: 'visible' as DocumentVisibilityState,
    addEventListener: (_: string, l: () => void) => void listeners.add(l),
    removeEventListener: (_: string, l: () => void) => void listeners.delete(l),
  };
  return {
    doc: doc as VisibilitySource,
    listeners,
    set(state: DocumentVisibilityState) {
      doc.visibilityState = state;
      listeners.forEach((l) => l());
    },
  };
}

function setup() {
  const mics: Microphone[] = [];
  let pitchOut: PitchListener = () => undefined;
  let levelOut: (db: number) => void = () => undefined;
  const pitchStop = vi.fn().mockResolvedValue(undefined);
  const setA4 = vi.fn();
  const levelStop = vi.fn();
  const spies = {
    openMicrophone: vi.fn(async () => {
      const mic = fakeMic(`mic${mics.length}`);
      mics.push(mic);
      return mic;
    }),
    startPitch: vi.fn(async (_s: unknown, listener: PitchListener, options?: { a4?: number }) => {
      pitchOut = listener;
      return { context: {}, a4: options?.a4 ?? 442, setA4, stop: pitchStop };
    }),
    startLevelMeter: vi.fn((_c: unknown, _s: unknown, listener: (db: number) => void) => {
      levelOut = listener;
      return { stop: levelStop };
    }),
  };
  const visibility = fakeDocument();
  const session = createMicSession({ deps: spies as unknown as MicSessionDeps, document: visibility.doc });
  return { session, spies, mics, pitchStop, levelStop, setA4, visibility, emitPitch: (r: PitchReading | null) => pitchOut(r), emitLevel: (db: number) => levelOut(db) };
}

/** openMicrophone que fica esperando a permissão até o teste liberar. */
function holdPermission(f: ReturnType<typeof setup>) {
  let allow: () => void = () => undefined;
  f.spies.openMicrophone.mockImplementationOnce(
    () =>
      new Promise<Microphone>((resolve) => {
        allow = () => {
          const mic = fakeMic('held');
          f.mics.push(mic);
          resolve(mic);
        };
      }),
  );
  return () => allow();
}

describe('createMicSession', () => {
  it('abre o microfone e liga afinação e nível na mesma fonte, no Lá da sessão', async () => {
    const f = setup();
    const audio = await f.session.open();
    expect(audio.source).toBe(f.mics[0].source);
    expect(audio.context).toBe(f.mics[0].context);
    expect(f.spies.startPitch).toHaveBeenCalledWith(f.mics[0].source, expect.any(Function), { a4: 442 });
    expect(f.spies.startLevelMeter).toHaveBeenCalledWith(f.mics[0].context, f.mics[0].source, expect.any(Function));
    expect(f.session.audio()).toEqual(audio);
  });

  it('abrir duas vezes (junto ou depois) devolve a mesma fonte: um microfone por app', async () => {
    const f = setup();
    const [a, b] = await Promise.all([f.session.open(), f.session.open()]);
    const c = await f.session.open();
    expect(f.spies.openMicrophone).toHaveBeenCalledOnce();
    expect(b.source).toBe(a.source);
    expect(c.source).toBe(a.source);
  });

  it('fechar durante a permissão fecha o microfone assim que ele chega; nada fica sem dono', async () => {
    const f = setup();
    const allow = holdPermission(f);
    const pending = f.session.open();
    f.session.close();
    allow();
    await expect(pending).rejects.toSatisfy(isMicClosed);
    await vi.waitFor(() => expect(f.mics[0].stop).toHaveBeenCalledOnce());
    expect(f.levelStop).not.toHaveBeenCalled();
    expect(f.session.audio()).toBeNull();
  });

  it('reabrir enquanto o anterior fecha espera o fechamento antes de pedir outro', async () => {
    const f = setup();
    await f.session.open();
    let finish: () => void = () => undefined;
    vi.mocked(f.mics[0].stop).mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    f.session.close();
    const reopen = f.session.open();
    await vi.waitFor(() => expect(f.mics[0].stop).toHaveBeenCalledOnce());
    expect(f.spies.openMicrophone).toHaveBeenCalledOnce();
    finish();
    await reopen;
    expect(f.spies.openMicrophone).toHaveBeenCalledTimes(2);
  });

  it('AbortSignal cancela o pedido; sem mais ninguém esperando, fecha o que abrir', async () => {
    const f = setup();
    const allow = holdPermission(f);
    const controller = new AbortController();
    const pending = f.session.open(controller.signal);
    controller.abort();
    await expect(pending).rejects.toSatisfy(isMicClosed);
    allow();
    await vi.waitFor(() => expect(f.mics[0].stop).toHaveBeenCalledOnce());
    await expect(f.session.open(controller.signal)).rejects.toSatisfy(isMicClosed);
  });

  it('AbortSignal de um não derruba o pedido de outro', async () => {
    const f = setup();
    const allow = holdPermission(f);
    const controller = new AbortController();
    const cancelled = f.session.open(controller.signal);
    const kept = f.session.open();
    controller.abort();
    allow();
    await expect(cancelled).rejects.toSatisfy(isMicClosed);
    expect((await kept).source).toBe(f.mics[0].source);
    expect(f.mics[0].stop).not.toHaveBeenCalled();
  });

  it('aba oculta fecha na hora e avisa com "hidden"; voltar visível não reabre sozinho', async () => {
    const f = setup();
    const onClose = vi.fn();
    f.session.onClose(onClose);
    await f.session.open();
    f.visibility.set('hidden');
    expect(onClose).toHaveBeenCalledWith('hidden');
    expect(f.session.audio()).toBeNull();
    await vi.waitFor(() => expect(f.mics[0].stop).toHaveBeenCalledOnce());
    expect(f.levelStop).toHaveBeenCalledOnce();
    expect(f.pitchStop).toHaveBeenCalledOnce();
    f.visibility.set('visible');
    expect(f.spies.openMicrophone).toHaveBeenCalledOnce();
    await f.session.open();
    expect(f.spies.openMicrophone).toHaveBeenCalledTimes(2);
  });

  it('aba oculta durante a permissão também avisa e fecha o que chegar', async () => {
    const f = setup();
    const onClose = vi.fn();
    f.session.onClose(onClose);
    const allow = holdPermission(f);
    const pending = f.session.open();
    f.visibility.set('hidden');
    allow();
    await expect(pending).rejects.toSatisfy(isMicClosed);
    expect(onClose).toHaveBeenCalledWith('hidden');
    await vi.waitFor(() => expect(f.mics[0].stop).toHaveBeenCalledOnce());
  });

  it('sem nada aberto, ocultar a aba ou fechar não avisa ninguém', () => {
    const f = setup();
    const onClose = vi.fn();
    f.session.onClose(onClose);
    f.visibility.set('hidden');
    f.session.close();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('close avisa com "stopped"', async () => {
    const f = setup();
    const onClose = vi.fn();
    f.session.onClose(onClose);
    await f.session.open();
    f.session.close();
    expect(onClose).toHaveBeenCalledExactlyOnceWith('stopped');
  });

  it('repassa leituras e nível a quem escuta, até cancelar', async () => {
    const f = setup();
    const onPitch = vi.fn();
    const onLevel = vi.fn();
    const off = f.session.onPitch(onPitch);
    f.session.onLevel(onLevel);
    await f.session.open();
    f.emitPitch(null);
    f.emitLevel(-30);
    off();
    f.emitPitch(null);
    expect(onPitch).toHaveBeenCalledOnce();
    expect(onLevel).toHaveBeenCalledWith(-30);
  });

  it('setA4 vale na hora para o pitch aberto e para a próxima abertura; recusa Lá absurdo', async () => {
    const f = setup();
    await f.session.open();
    f.session.setA4(440);
    expect(f.setA4).toHaveBeenCalledWith(440);
    expect(f.session.a4).toBe(440);
    f.session.close();
    await f.session.open();
    expect(f.spies.startPitch).toHaveBeenLastCalledWith(expect.anything(), expect.any(Function), { a4: 440 });
    expect(() => f.session.setA4(1000)).toThrow(RangeError);
  });

  it('recusa do navegador sobe como erro e o próximo open pede de novo', async () => {
    const f = setup();
    f.spies.openMicrophone.mockRejectedValueOnce(new DOMException('x', 'NotAllowedError'));
    await expect(f.session.open()).rejects.toMatchObject({ name: 'NotAllowedError' });
    await f.session.open();
    expect(f.spies.openMicrophone).toHaveBeenCalledTimes(2);
  });

  it('falha ao ligar a afinação fecha o microfone aberto', async () => {
    const f = setup();
    f.spies.startPitch.mockRejectedValueOnce(new DOMException('x', 'InvalidStateError'));
    await expect(f.session.open()).rejects.toMatchObject({ name: 'InvalidStateError' });
    expect(f.mics[0].stop).toHaveBeenCalledOnce();
    expect(f.session.audio()).toBeNull();
  });

  it('dispose para de escutar a visibilidade e fecha sem avisar', async () => {
    const f = setup();
    const onClose = vi.fn();
    f.session.onClose(onClose);
    await f.session.open();
    f.session.dispose();
    expect(f.visibility.listeners.size).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(f.mics[0].stop).toHaveBeenCalledOnce());
  });
});
