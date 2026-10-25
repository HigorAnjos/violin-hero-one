import { expect, test, type Page } from '@playwright/test';

// Microfone falso do Chromium e autoplay liberado: o Ouvido de verdade abre sem violino
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    (window as Window & { __liveTracks?: () => number }).__liveTracks = () =>
      streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === 'live').length;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      streams.push(stream);
      return stream;
    };
  });
});

const liveTracks = (page: Page) => page.evaluate(() => (window as Window & { __liveTracks?: () => number }).__liveTracks?.() ?? -1);

test('nenhuma tela de menu deixa o microfone aberto', async ({ page }) => {
  await page.goto('/primeira-vez/microfone');
  await page.getByRole('button', { name: /Permitir microfone/ }).click();
  await expect(page).toHaveURL(/\/primeira-vez\/cordas$/);
  await expect.poll(() => liveTracks(page)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Pular por agora' }).click();
  await expect(page).toHaveURL(/\/teste$/);
  await expect.poll(() => liveTracks(page)).toBe(0);

  await page.getByRole('link', { name: /Tocar Ode/ }).click();
  await expect(page).toHaveURL(/\/afinar$/);
  await expect.poll(() => liveTracks(page)).toBeGreaterThan(0);
  await page.getByRole('link', { name: 'Voltar' }).first().click();
  await expect(page).toHaveURL(/\/(teste|primeira-vez\/nivel)$/);
  await expect.poll(() => liveTracks(page)).toBe(0);
});

test('do afinar ao jogo o microfone segue aberto, e sair pela pausa o fecha', async ({ page }) => {
  await page.goto('/teste');
  await page.getByRole('link', { name: /Tocar Escala/ }).click();
  await expect.poll(() => liveTracks(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/jogo$/);
  expect(await liveTracks(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: 'Sair para músicas' }).click();
  // Sem a primeira vez feita, o início leva ao onboarding (nível): menu, sem microfone
  await expect(page).toHaveURL(/\/(teste|primeira-vez\/nivel)$/);
  await expect.poll(() => liveTracks(page)).toBe(0);
});
