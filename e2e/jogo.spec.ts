import { expect, test, type Page } from '@playwright/test';
import { simulateGame, type GameResult } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { chooseSong, skipOnboarding } from './choose';
import { fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';
import { openWithState } from './state';

// Build do e2e (--mode e2e): ?ouvido=simulado e ?simular valem. Sem gesto o Chromium não libera o áudio;
// a política de autoplay deixa abrir /jogo direto pela URL.
test.use({ launchOptions: launchWith('--autoplay-policy=no-user-gesture-required') });

const played = (errors: number, noFail = true): GameResult => simulateGame({ song: ODE, startAt: 1, noFail }, { errors, seed: 2 }).result;

async function checkThemed(page: Page, tema: string) {
  await fontsReady(page, tema);
  await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
  await expectFits(page);
  expect(await tooSmallTargets(page), 'alvos de toque abaixo de 44 px').toEqual([]);
  expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
  await expectVisibleFocus(page);
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) test.describe(`${tema}: telas de jogo cabem, 44 px de toque, foco visível`, () => {
  const checkScreen = (page: Page) => checkThemed(page, tema);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
  });

  test('afinação', async ({ page }) => {
    await page.goto('/afinar?ouvido=simulado');
    await expect(page.getByRole('region', { name: 'Afinador' })).toBeVisible();
    await checkScreen(page);
  });

  test('jogo e pausa', async ({ page }) => {
    await page.goto('/jogo?ouvido=simulado&musica=ode-a-alegria');
    await page.getByRole('button', { name: 'Pausar' }).click();
    await expect(page.getByRole('dialog', { name: 'PAUSADO' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continuar/ })).toBeFocused();
    await checkScreen(page);
  });

  test('resultado', async ({ page }) => {
    await openWithState(page, '/resultado', { song: ODE, mode: 'Arcade', result: played(3) });
    await expect(page.getByTestId('resultado')).toBeVisible();
    await checkScreen(page);
  });

  test('a orquestra parou', async ({ page }) => {
    await openWithState(page, '/orquestra-parou', { song: ODE, result: played(16, false) });
    await expect(page.getByRole('heading', { name: 'A orquestra parou… por hoje!' })).toBeVisible();
    await checkScreen(page);
  });

  test('selo novo, parado com reduzir movimento', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWithState(page, '/selo-novo', { song: ODE, result: { ...played(0), badges: ['primeira-musica', 'combo-25'] } });
    await expect(page.getByRole('heading', { name: 'Selo novo: Combo 25' })).toBeVisible();
    const animation = await page.getByRole('img', { name: 'Selo Combo 25', exact: true }).evaluate((el) => getComputedStyle(el.parentElement!).animationName);
    expect(animation).toBe('none');
    await checkScreen(page);
  });
});

test('joga a escala do início ao fim com o ouvido simulado, da afinação ao resultado', async ({ page }) => {
  test.setTimeout(60000);
  await skipOnboarding(page);
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, /Escala/);
  await page.getByRole('button', { name: /Começar/ }).click();
  await expect(page).toHaveURL(/\/contagem$/);
  await expect(page).toHaveURL(/\/jogo$/, { timeout: 10000 });
  await expect(page).toHaveURL(/\/selo-novo$/, { timeout: 40000 });
  await page.getByRole('link', { name: /Ver resultado/ }).click();
  await expect(page.getByTestId('resultado')).toContainText('Escala de Ré maior');
  await expect(page.getByTestId('resultado')).toContainText('100,0%');
});

test('?simular toca a música inteira sem microfone e deixa o resultado para conferir', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/jogo?ouvido=simulado&musica=escala-re-maior&simular=0');
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: 40000 });
  const result = await page.evaluate(() => (window as Window & { __vhResult?: GameResult }).__vhResult);
  expect(result?.status).toBe('finished');
  expect(result?.counts.miss).toBe(0);
});

test('?simular com erros demais para a orquestra', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/jogo?ouvido=simulado&musica=ode-a-alegria&simular=0&erros=40');
  await expect(page.getByRole('heading', { name: 'A orquestra parou… por hoje!' })).toBeVisible({ timeout: 40000 });
});

