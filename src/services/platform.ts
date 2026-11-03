import { KeepAwake } from '@capacitor-community/keep-awake';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

/**
 * Tudo o que muda no app de celular (Capacitor, Android e iOS) passa por aqui; na web nada disso roda e o app segue
 * igual (service worker, volta da conta pela própria página). Os plugins nativos só são chamados no nativo.
 */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'android', 'ios' ou 'web': o caminho dos ajustes do sistema muda de um para o outro. */
export function nativePlatform(): 'android' | 'ios' | 'web' {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios' ? platform : 'web';
}

/**
 * O app foi para o fundo (outro app, tela apagada, bloqueio): no nativo, pelo `pause` do Capacitor, que chega mesmo
 * quando o WebView não avisa a página pelo visibilitychange. Na web, nunca chama (a página tem o visibilitychange).
 * Devolve o cancelar.
 */
export function onAppPause(listener: () => void): () => void {
  return onAppState('pause', listener);
}

/** O app voltou do fundo (por exemplo, dos ajustes do sistema): no nativo; na web, nunca chama. */
export function onAppResume(listener: () => void): () => void {
  return onAppState('resume', listener);
}

function onAppState(event: 'pause' | 'resume', listener: () => void): () => void {
  if (!isNative()) return () => undefined;
  let stopped = false;
  const deliver = () => {
    if (!stopped) listener();
  };
  const handle = event === 'pause' ? App.addListener('pause', deliver) : App.addListener('resume', deliver);
  return () => {
    stopped = true;
    void handle.then((h) => h.remove());
  };
}

/** Versão e build do app instalado (nativo), para o diagnóstico; na web, null. */
export async function nativeAppInfo(): Promise<{ version: string; build: string } | null> {
  if (!isNative()) return null;
  try {
    const info = await App.getInfo();
    return { version: info.version, build: info.build };
  } catch {
    return null;
  }
}

/**
 * Tela acesa (durante a partida): no nativo, pelo plugin de keep-awake; na web não faz nada. Devolve o desligar.
 * Falha do plugin não para o jogo: a tela só pode apagar como antes.
 */
export function keepScreenOn(): () => void {
  if (!isNative()) return () => undefined;
  void KeepAwake.keepAwake().catch(() => undefined);
  return () => void KeepAwake.allowSleep().catch(() => undefined);
}

/**
 * Endereços que abrem o app (app.violinhero://auth/…, a volta do link mágico e do Google), inclusive o que abriu o
 * app fechado. O mesmo endereço chega uma vez só (o da abertura pode vir pelos dois caminhos, e o código da conta
 * não pode ser trocado duas vezes). Na web, nunca chama. Devolve o cancelar.
 */
export function onAppUrl(listener: (url: string) => void): () => void {
  if (!isNative()) return () => undefined;
  let stopped = false;
  let last: string | undefined;
  const deliver = (url: string) => {
    if (stopped || url === last) return;
    last = url;
    listener(url);
  };
  void App.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) deliver(launch.url);
    })
    .catch(() => undefined);
  const handle = App.addListener('appUrlOpen', ({ url }) => deliver(url));
  return () => {
    stopped = true;
    void handle.then((h) => h.remove());
  };
}

/**
 * Página de fora do app (o Google): no navegador do sistema, porque o Google não deixa entrar por WebView. Na web, a
 * própria página vai para lá.
 */
export async function openExternal(url: string): Promise<void> {
  if (!isNative()) {
    window.location.assign(url);
    return;
  }
  await Browser.open({ url, presentationStyle: 'popover' });
}

/** Fecha o navegador do sistema aberto por openExternal (no iOS ele fica por cima do app na volta). */
export async function closeExternal(): Promise<void> {
  if (!isNative()) return;
  await Browser.close().catch(() => undefined);
}
