import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNative: false,
  keepAwake: vi.fn(async () => undefined),
  allowSleep: vi.fn(async () => undefined),
  launchUrl: undefined as string | undefined,
  urlListener: undefined as ((event: { url: string }) => void) | undefined,
  remove: vi.fn(async () => undefined),
  open: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.isNative } }));
vi.mock('@capacitor-community/keep-awake', () => ({ KeepAwake: { keepAwake: native.keepAwake, allowSleep: native.allowSleep } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: native.open, close: native.close } }));
vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: async () => (native.launchUrl ? { url: native.launchUrl } : undefined),
    addListener: async (_event: string, listener: (event: { url: string }) => void) => {
      native.urlListener = listener;
      return { remove: native.remove };
    },
  },
}));

import { closeExternal, isNative, keepScreenOn, onAppUrl, openExternal } from './platform';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  native.isNative = false;
  native.launchUrl = undefined;
  native.urlListener = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('platform na web', () => {
  it('não é nativo e não chama plugin nenhum', async () => {
    expect(isNative()).toBe(false);
    keepScreenOn()();
    const listener = vi.fn();
    onAppUrl(listener)();
    await closeExternal();
    await flush();
    expect(native.keepAwake).not.toHaveBeenCalled();
    expect(native.allowSleep).not.toHaveBeenCalled();
    expect(native.urlListener).toBeUndefined();
    expect(native.close).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a página de fora abre na própria aba', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await openExternal('https://accounts.google.com/x');
    expect(assign).toHaveBeenCalledWith('https://accounts.google.com/x');
    expect(native.open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('platform no nativo', () => {
  beforeEach(() => {
    native.isNative = true;
  });

  it('tela acesa liga e o desligar deixa apagar', () => {
    const release = keepScreenOn();
    expect(native.keepAwake).toHaveBeenCalledOnce();
    expect(native.allowSleep).not.toHaveBeenCalled();
    release();
    expect(native.allowSleep).toHaveBeenCalledOnce();
  });

  it('falha do keep-awake não estoura', async () => {
    native.keepAwake.mockRejectedValueOnce(new Error('sem plugin'));
    keepScreenOn();
    await flush();
  });

  it('entrega o endereço que abriu o app e os que chegam depois, cada um uma vez', async () => {
    native.launchUrl = 'app.violinhero://auth/?code=a';
    const listener = vi.fn();
    const stop = onAppUrl(listener);
    await flush();
    native.urlListener?.({ url: 'app.violinhero://auth/?code=a' });
    native.urlListener?.({ url: 'app.violinhero://auth/conta?code=b' });
    expect(listener.mock.calls).toEqual([['app.violinhero://auth/?code=a'], ['app.violinhero://auth/conta?code=b']]);
    stop();
    await flush();
    expect(native.remove).toHaveBeenCalledOnce();
    native.urlListener?.({ url: 'app.violinhero://auth/?code=c' });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a página de fora abre no navegador do sistema, e fecha na volta', async () => {
    await openExternal('https://accounts.google.com/x');
    expect(native.open).toHaveBeenCalledWith({ url: 'https://accounts.google.com/x', presentationStyle: 'popover' });
    await closeExternal();
    expect(native.close).toHaveBeenCalledOnce();
  });
});
