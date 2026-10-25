import { defineConfig, devices } from '@playwright/test';

// Cada worktree pode subir a própria prévia (E2E_PORT): com a porta fixa, um floor reaproveitaria o build de outro
const port = Number(process.env.E2E_PORT) || 4173;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
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
