import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';
import { SESSION } from './e2e/catalogo/sessao';

/**
 * e2e do catálogo: o app servido com o Supabase local (npm run db:local já subiu, migrou e semeou) no lugar do build
 * sem banco do playwright.config.ts. Build e prévia próprios (dist-catalogo, porta E2E_CATALOG_PORT) para rodar ao
 * lado do e2e comum sem um sobrescrever o outro.
 */
const port = Number(process.env.E2E_CATALOG_PORT) || 4183;
const baseURL = `http://localhost:${port}`;

/** URL e chave anon do Supabase local; uma vez só (os workers herdam o ambiente do processo principal). */
function localSupabase(): { url: string; key: string } {
  if (!process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_ANON_KEY) {
    const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
    if (!status.API_URL || !status.ANON_KEY) throw new Error('Supabase local fora do ar: rode `npm run db:local` antes do e2e do catálogo.');
    process.env.E2E_SUPABASE_URL = status.API_URL;
    process.env.E2E_SUPABASE_ANON_KEY = status.ANON_KEY;
  }
  return { url: process.env.E2E_SUPABASE_URL!, key: process.env.E2E_SUPABASE_ANON_KEY! };
}

const supabase = localSupabase();

export default defineConfig({
  testDir: './e2e/catalogo',
  // Pastas próprias: rodando ao lado do e2e comum, um não apaga o print e o trace do outro
  outputDir: 'test-results-catalogo',
  // A amostra pelo microfone usa os WAV sintéticos, como o e2e comum
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  // As partidas tocam em tempo real (~5 min de música por nível): em paralelo para caber no job
  fullyParallel: true,
  workers: Number(process.env.E2E_CATALOG_WORKERS) || 3,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-catalogo' }]] : 'list',
  use: {
    baseURL,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    // Um login anônimo para a suíte toda: o Supabase local aceita 30 por hora por IP (auth.rate_limit)
    { name: 'sessao', testMatch: /sessao\.setup\.ts$/, use: { storageState: undefined } },
    {
      name: 'desktop',
      dependencies: ['sessao'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, storageState: SESSION },
    },
    {
      name: 'celular',
      dependencies: ['sessao'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        storageState: SESSION,
      },
    },
  ],
  webServer: {
    command: `npm run build -- --mode e2e --outDir dist-catalogo && npm run preview -- --port ${port} --strictPort --outDir dist-catalogo`,
    url: baseURL,
    env: { SUPABASE_URL: supabase.url, SUPABASE_ANON_KEY: supabase.key },
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
