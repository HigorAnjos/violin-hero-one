import { test as base, type Browser, type Page } from '@playwright/test';
import { takePath, type TakeName } from './audio/takes';

export interface MicrophoneOptions {
  /** O Chromium repete o arquivo por padrão; música toca uma vez só, a partir da abertura do microfone. */
  loop?: boolean;
}

export function microphoneArgs(take: TakeName, { loop = true }: MicrophoneOptions = {}): string[] {
  return [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=${takePath(take)}${loop ? '' : '%noloop'}`,
    // Sem gesto o AudioContext nasce suspenso e a tela cairia em "áudio bloqueado"
    '--autoplay-policy=no-user-gesture-required',
    // Saída falsa no relógio do sistema, o mesmo do arquivo: com a placa de som real o AudioContext deriva do WAV
    // sob carga (até 300 ms numa música) e os julgamentos saem adiantados; também não toca nada nos alto-falantes
    '--disable-audio-output',
  ];
}

interface MicrophoneFixtures {
  /** Página num Chromium próprio cujo microfone é o WAV `take` (o arquivo é do navegador, não da aba). */
  micPage: (take: TakeName, options?: MicrophoneOptions) => Promise<Page>;
}

export const test = base.extend<MicrophoneFixtures>({
  micPage: async ({ playwright, baseURL, viewport, deviceScaleFactor, isMobile, hasTouch, userAgent, locale }, use) => {
    const browsers: Browser[] = [];
    await use(async (take, options) => {
      const browser = await playwright.chromium.launch({ args: microphoneArgs(take, options) });
      browsers.push(browser);
      const context = await browser.newContext({
        baseURL,
        viewport,
        deviceScaleFactor,
        isMobile,
        hasTouch,
        userAgent,
        locale,
        permissions: ['microphone'],
      });
      return context.newPage();
    });
    await Promise.all(browsers.map((b) => b.close()));
  },
});

export { expect } from '@playwright/test';
