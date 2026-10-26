import { readdirSync } from 'node:fs';
import path from 'node:path';
import { test as base, type Browser, type Page } from '@playwright/test';
import { takePath, type TakeName } from './audio/takes';

const BUILT_ASSETS = path.resolve(import.meta.dirname, '../dist/assets');

/**
 * Aquece o áudio na aba antes da partida: um AudioContext com os worklets do build (pitch e nível) carregados e
 * fechados. O WAV começa no getUserMedia e o relógio da partida só depois que o Ouvido carregou os worklets; a frio
 * (navegador novo, máquina carregada) esse intervalo cresce e as notas chegam adiantadas — artefato do e2e, porque o
 * jogador de verdade só toca depois da contagem. Na tela inicial, que não abre o microfone.
 */
export async function warmAudio(page: Page) {
  const worklets = readdirSync(BUILT_ASSETS)
    .filter((file) => /^worklet-.*\.js$/.test(file))
    .map((file) => `/assets/${file}`);
  if (!worklets.length) throw new Error(`nenhum worklet em ${BUILT_ASSETS}: o build do e2e mudou o nome deles?`);
  await page.goto('/');
  await page.evaluate(async (urls) => {
    const context = new AudioContext();
    await Promise.all(urls.map((url) => context.audioWorklet.addModule(url)));
    await context.close();
  }, worklets);
}

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
