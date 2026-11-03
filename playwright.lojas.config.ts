import { defineConfig, devices } from '@playwright/test';
import { launchWith } from './e2e/launch';

/**
 * Capturas de tela das lojas (npm run store:screenshots): o build do e2e (Ouvido simulado, sem Supabase, só dados de
 * exemplo) no celular deitado, salvas em store/screenshots/<loja>/. Não é teste de regressão: roda à mão quando a tela
 * muda. Tamanhos: Play 1920×1080 (16:9, o lado maior até 2× o menor) e App Store 2796×1290 (iPhone de 6,7").
 */
const port = Number(process.env.E2E_PORT) || 4173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e/lojas',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    serviceWorkers: 'block',
    // A partida começa sozinha (contagem e áudio sem gesto)
    launchOptions: launchWith('--autoplay-policy=no-user-gesture-required'),
  },
  projects: [
    {
      name: 'play',
      use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 450 }, deviceScaleFactor: 2.4, isMobile: true, hasTouch: true },
    },
    {
      name: 'appstore',
      use: { ...devices['Desktop Chrome'], viewport: { width: 932, height: 430 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: `npm run build -- --mode e2e && npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
