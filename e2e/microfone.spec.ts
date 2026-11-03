import { expect, test } from '@playwright/test';
import { launchWith } from './launch';

// Microfone falso do Chromium (um bipe): prova que o Ouvido de verdade abre no build de produção
test.use({
  permissions: ['microphone'],
  launchOptions: launchWith('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'),
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

test('diagnóstico de áudio: o Chromium desliga o processamento de voz e informa taxa e latências', async ({ page }) => {
  await page.goto('/configuracoes?diagnostico');
  await expect(page).toHaveURL(/\/diagnostico$/);
  await page.getByRole('button', { name: 'Ligar o microfone' }).click();
  const report = page.getByRole('textbox', { name: 'Diagnóstico em texto' });
  await expect(report).toHaveValue(/aplicado: echoCancellation=desligado noiseSuppression=desligado autoGainControl=desligado/);
  await expect(report).toHaveValue(/ignorado pelo WebView: nenhum/);
  await expect(report).toHaveValue(/taxa: contexto \d+ Hz · microfone \d+ Hz/);
  await expect(report).toHaveValue(/latência: base \d+\.\d ms · saída \d+\.\d ms/);
  // O bipe do microfone falso chega ao medidor de nível
  await expect(report).toHaveValue(/nível: -?\d+\.\d dBFS/, { timeout: 8000 });
  await page.getByRole('button', { name: 'Desligar o microfone' }).click();
  await expect(report).toHaveValue(/microfone: fechado/);
});
