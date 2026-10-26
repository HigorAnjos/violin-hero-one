import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { createAppUpdate } from './appUpdate';

function fakeRegister() {
  const reload = vi.fn(async () => undefined);
  let options: RegisterSWOptions = {};
  const register = vi.fn((o: RegisterSWOptions) => {
    options = o;
    return reload;
  });
  return { register, reload, options: () => options };
}

describe('createAppUpdate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('avisa quem escuta quando a versão nova termina de baixar', () => {
    const sw = fakeRegister();
    const update = createAppUpdate(sw.register);
    const listener = vi.fn();
    update.subscribe(listener);
    expect(update.waiting()).toBe(false);
    sw.options().onNeedRefresh?.();
    expect(update.waiting()).toBe(true);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('quem saiu não é mais avisado', () => {
    const sw = fakeRegister();
    const update = createAppUpdate(sw.register);
    const listener = vi.fn();
    update.subscribe(listener)();
    sw.options().onNeedRefresh?.();
    expect(listener).not.toHaveBeenCalled();
  });

  it('atualizar troca o service worker e recarrega', () => {
    const sw = fakeRegister();
    createAppUpdate(sw.register).apply();
    expect(sw.reload).toHaveBeenCalledWith(true);
  });

  it('confere versão nova de tempos em tempos e engole a falha sem internet', async () => {
    vi.useFakeTimers();
    const sw = fakeRegister();
    createAppUpdate(sw.register, 1000);
    const registration = { update: vi.fn().mockRejectedValue(new Error('offline')) } as unknown as ServiceWorkerRegistration;
    sw.options().onRegisteredSW?.('/sw.js', registration);
    await vi.advanceTimersByTimeAsync(2500);
    expect(registration.update).toHaveBeenCalledTimes(2);
  });
});
