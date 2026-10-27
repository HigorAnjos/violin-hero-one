import { expect, test, type Page } from '@playwright/test';
import type { PracticeResult } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { launchWith } from './launch';
import { openWithState } from './state';

// Ouvido de verdade (microfone falso do Chromium) para a aba escondida fechar o microfone; ?simular toca as notas
test.use({
  permissions: ['microphone'],
  launchOptions: launchWith('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'),
});

/** A aba some e volta, como trocar de app no celular: o MicSession fecha o microfone no 'hidden'. */
async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

test('microfone reaberto no meio da prática: pausa, o Continuar reabre e as passadas seguem sem nota perdida', async ({ page }) => {
  test.setTimeout(90000);
  await openWithState(page, '/pratica?simular=0', { song: ODE, mode: 'Prática', practice: { loop: { startMeasure: 0, endMeasure: 1 }, speed: 1 } });
  await expect(page.getByText('PASSADA 2', { exact: true })).toBeVisible({ timeout: 25000 });

  await setVisibility(page, 'hidden');
  await expect(page.getByRole('dialog', { name: 'PAUSADO' })).toContainText('O microfone fechou');
  await setVisibility(page, 'visible');
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10000 });

  await expect(page.getByText('PASSADA 4', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /Sair da prática/ }).click();
  await expect(page).toHaveURL(/\/resultado$/, { timeout: 10000 });
  const result = await page.evaluate(() => (window as Window & { __vhResult?: PracticeResult }).__vhResult);
  expect(result?.laps.filter((l) => l.complete).length).toBeGreaterThanOrEqual(3);
  expect(result?.counts.miss).toBe(0);
});
