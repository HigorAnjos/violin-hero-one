import { expect, test } from '@playwright/test';

// Microfone falso do Chromium (um bipe): prova que o Ouvido de verdade abre no build de produção
test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
});

test('o Ouvido de verdade abre e o onboarding passa do microfone para as cordas', async ({ page }) => {
  await page.goto('/primeira-vez/microfone');
  await page.getByRole('button', { name: /Permitir microfone/ }).click();
  await expect(page).toHaveURL(/\/primeira-vez\/cordas$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toque cada corda solta com o arco');
  // Os medidores saem do zero com o som do microfone falso
  const meters = page.getByRole('img', { name: /^(Volume|Ruído do ambiente): / });
  await expect
    .poll(async () => (await meters.evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))).some((l) => !/ 0 de 12$/.test(l ?? '')), {
      timeout: 8000,
    })
    .toBe(true);
  await expect(page).toHaveURL(/\/primeira-vez\/cordas$/);
});
