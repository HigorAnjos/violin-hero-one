import { expect, test, type Page } from '@playwright/test';
import type { GameResult } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';
import { openWithState } from './state';

// Build do e2e (--mode e2e): ?ouvido=simulado e ?simular valem; sem gesto o Chromium não libera o áudio
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

const LONG_TITLE = 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato (versão completa com cadência)';
const lastResult = (page: Page) => page.evaluate(() => (window as Window & { __vhResult?: GameResult }).__vhResult);

/** O canvas das cordas desenhou alguma coisa (WebGL de verdade, não um canvas vazio). */
async function stringsDrawn(page: Page) {
  const canvas = page.getByTestId('cordas-3d').locator('canvas');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  // A captura da área tem pixels que não são o fundo da página: o chão e as cordas
  const shot = await canvas.screenshot();
  expect(shot.byteLength).toBeGreaterThan(5000);
}

for (const tema of ['caderno', 'palco'] as const) {
  test(`${tema}: Cordas 3D (5c) cabem, alvos de 44 px, texto legível e foco visível`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
    await openWithState(page, '/jogo/3d?ouvido=simulado&simular=0', { song: { ...ODE, title: LONG_TITLE }, mode: 'Cordas 3D' });
    await expect(page.getByRole('region', { name: 'Placar' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Afinação' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Cordas 3D: as quatro cordas/ })).toBeVisible();
    await stringsDrawn(page);
    await fontsReady(page);
    await expectFits(page);
    expect(await tooSmallTargets(page), 'alvos de toque abaixo de 44 px').toEqual([]);
    expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
    await expectVisibleFocus(page);
  });
}

test('reduzir movimento: o julgamento das Cordas 3D não pulsa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/jogo/3d?ouvido=simulado&musica=ode-a-alegria&simular=0');
  const judgment = page.locator('[data-judgment]').first();
  await expect(judgment).toBeVisible({ timeout: 15000 });
  await expect(judgment).toHaveCSS('animation-name', 'none');
});

test('joga uma música inteira em Cordas 3D com ?simular', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/jogo/3d?ouvido=simulado&musica=ode-a-alegria&simular=0');
  await stringsDrawn(page);
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: 70000 });
  const result = await lastResult(page);
  expect(result?.status).toBe('finished');
  expect(result?.counts.miss).toBe(0);
});
