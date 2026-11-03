import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RegisterSWOptions } from 'vite-plugin-pwa/types';
import { createAppUpdate, startAppUpdate } from './appUpdate';

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

  /** Service worker esperando: guarda a mensagem e deixa o teste trocar o estado dele. */
  function waitingWorker() {
    const worker = Object.assign(new EventTarget(), { state: 'installed' as ServiceWorkerState, postMessage: vi.fn() });
    const become = (state: ServiceWorkerState) => {
      worker.state = state;
      worker.dispatchEvent(new Event('statechange'));
    };
    return { worker: worker as unknown as ServiceWorker, postMessage: worker.postMessage, become };
  }

  it('atualizar com versão nova esperando: manda ela entrar e recarrega quando ela ativa, num clique', () => {
    const sw = fakeRegister();
    const reload = vi.fn();
    const update = createAppUpdate(sw.register, 1000, reload);
    const next = waitingWorker();
    sw.options().onRegisteredSW?.('/sw.js', { waiting: next.worker, update: vi.fn() } as unknown as ServiceWorkerRegistration);
    update.apply();
    expect(next.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    next.become('activating');
    expect(reload).not.toHaveBeenCalled();
    // Vale também para a página sem controlador (primeira visita): não depende do controllerchange
    next.become('activated');
    expect(reload).toHaveBeenCalledOnce();
    // O registerSW não recarrega por conta própria (seriam duas recargas) nem é quem troca de versão
    sw.options().onNeedReload?.();
    expect(reload).toHaveBeenCalledOnce();
    expect(sw.reload).not.toHaveBeenCalled();
  });

  it('atualizar sem versão esperando (a nova já ativou sozinha, página sem controlador): recarrega na hora', () => {
    const sw = fakeRegister();
    const reload = vi.fn();
    const update = createAppUpdate(sw.register, 1000, reload);
    sw.options().onRegisteredSW?.('/sw.js', { waiting: null, update: vi.fn() } as unknown as ServiceWorkerRegistration);
    update.apply();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('a versão que esperava vira redundant (falhou ou outra tomou o lugar): o clique ainda recarrega', () => {
    const sw = fakeRegister();
    const reload = vi.fn();
    const update = createAppUpdate(sw.register, 1000, reload);
    const next = waitingWorker();
    sw.options().onRegisteredSW?.('/sw.js', { waiting: next.worker, update: vi.fn() } as unknown as ServiceWorkerRegistration);
    update.apply();
    next.become('redundant');
    expect(reload).toHaveBeenCalledOnce();
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

describe('startAppUpdate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no celular não registra o service worker nem avisa versão nova (a versão vem da loja)', () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: {} });
    const sw = fakeRegister();
    expect(startAppUpdate({ native: true, forcePending: false, register: sw.register })).toBeUndefined();
    expect(startAppUpdate({ native: true, forcePending: true, register: sw.register })).toBeUndefined();
    expect(sw.register).not.toHaveBeenCalled();
  });

  it('na web registra o service worker do build', () => {
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: {} });
    const sw = fakeRegister();
    const update = startAppUpdate({ native: false, forcePending: false, register: sw.register });
    expect(sw.register).toHaveBeenCalledOnce();
    expect(update?.waiting()).toBe(false);
  });

  it('na web sem service worker não há aviso; ?nova-versao força o aviso sem registrar', () => {
    const sw = fakeRegister();
    expect('serviceWorker' in navigator).toBe(false);
    expect(startAppUpdate({ native: false, forcePending: false, register: sw.register })).toBeUndefined();
    expect(startAppUpdate({ native: false, forcePending: true, register: sw.register })?.waiting()).toBe(true);
    expect(sw.register).not.toHaveBeenCalled();
  });
});
