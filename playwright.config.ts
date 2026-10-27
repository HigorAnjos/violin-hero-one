import { defineConfig, devices } from '@playwright/test';
import { launchWith } from './e2e/launch';

// Cada worktree pode subir a própria prévia (E2E_PORT): com a porta fixa, um floor reaproveitaria o build de outro
const port = Number(process.env.E2E_PORT) || 4173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  // e2e/catalogo/ precisa do Supabase local: roda pelo playwright.catalogo.config.ts (npm run test:e2e:catalogo)
  testIgnore: 'catalogo/**',
  // Grava os WAV do microfone falso (e2e/audio/synthetic/) antes dos testes
  globalSetup: './e2e/global-setup.ts',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    // Print e trace de toda falha (não só da repetição): a CI publica os dois como artefato do job e2e
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // O page.route não vê o que o service worker responde (fontes, áudio): só o offline.spec liga o SW
    serviceWorkers: 'block',
    // A hora da partida é o relógio do áudio: na placa de som real ele para sob carga (e2e/launch.ts)
    launchOptions: launchWith(),
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      // O jogo roda com o celular deitado (paisagem)
      name: 'celular',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 844, height: 390 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // Testa o artefato de build; sem SUPABASE_* o app fica Offline, como na prévia sem backend
  webServer: {
    // --mode e2e liga as ferramentas de conferência (?simular, ?ouvido=simulado, ?musica); o build de produção não as tem
    command: `npm run build -- --mode e2e && npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
