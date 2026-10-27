import { expect, test, type Page } from '@playwright/test';
import { simulateGame, type GameResult, type PracticeResult } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectFits, expectVisibleFocus, LONG_TITLE, tinyText, tooSmallTargets } from './layout';
import { openWithState } from './state';

// Build do e2e (--mode e2e): ?ouvido=simulado e ?simular valem; sem gesto o Chromium não libera o áudio
test.use({ launchOptions: launchWith('--autoplay-policy=no-user-gesture-required') });

const SONG = { ...ODE, title: LONG_TITLE };
const LOOP = { startMeasure: 2, endMeasure: 3 };

const played = (errors: number): GameResult => simulateGame({ song: ODE, startAt: 1, noFail: true }, { errors, seed: 2 }).result;
const lastResult = (page: Page) => page.evaluate(() => (window as Window & { __vhResult?: PracticeResult }).__vhResult);

async function checkScreen(page: Page) {
  await expectFits(page);
  expect(await tooSmallTargets(page), 'alvos de toque abaixo de 44 px').toEqual([]);
  expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      const ready = async (page: Page) => (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));

      test.beforeEach(async ({ page }) => {
        if (fonte === 'reserva') await blockWebFonts(page);
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      });

      test('partitura (5b) com título longo', async ({ page }) => {
        await openWithState(page, '/jogo/partitura?ouvido=simulado&simular=0', { song: SONG, mode: 'Partitura' });
        await expect(page.getByRole('region', { name: 'Partitura' })).toContainText('Partitura · Ré maior · 4/4');
        await expect(page.getByRole('region', { name: 'Nota atual' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Afinação ao vivo' })).toBeVisible();
        await expect(page.getByTestId('partitura').locator('canvas')).toBeVisible();
        await ready(page);
        await checkScreen(page);
        await expectVisibleFocus(page);
      });

      test('pausa com velocidade e metrônomo', async ({ page }) => {
        await openWithState(page, '/jogo/partitura?ouvido=simulado', { song: SONG, mode: 'Partitura' });
        await page.getByRole('button', { name: 'Pausar' }).click();
        await expect(page.getByRole('group', { name: 'Escolher a velocidade' })).toBeVisible();
        await expect(page.getByRole('slider', { name: /Volume do metrônomo/ })).toBeAttached();
        await ready(page);
        await checkScreen(page);
        await page.getByRole('button', { name: '70%' }).click();
        await expect(page.getByRole('alertdialog')).toContainText('conta como prática');
        await checkScreen(page);
      });

      test('prática (10) com laço', async ({ page }) => {
        await openWithState(page, '/pratica?ouvido=simulado&simular=0', { song: SONG, mode: 'Prática', practice: { loop: LOOP, speed: 0.7 } });
        await expect(page.getByRole('heading', { name: 'Compassos 3–4 em loop' })).toBeVisible();
        await expect(page.getByTestId('partitura').locator('canvas')).toBeVisible();
        await ready(page);
        await checkScreen(page);
        await expectVisibleFocus(page);
      });

      test('resultado com recorde e "Praticar compassos"', async ({ page }) => {
        await openWithState(page, '/resultado', { song: SONG, mode: 'Partitura', result: { ...played(4), score: 9876543, maxCombo: 12345 }, record: { previous: 9000000, improved: true } });
        await expect(page.getByText('+876.543 sobre o recorde')).toBeVisible();
        await expect(page.getByRole('link', { name: 'Praticar compassos' })).toBeVisible();
        await ready(page);
        await checkScreen(page);
        const cut = await page.evaluate(() => [...document.querySelectorAll('dt, dd')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent));
        expect(cut, 'rótulos e números cortados').toEqual([]);
      });
    });
  }
}

test('reduzir movimento: o julgamento grande da partitura não pulsa', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/jogo/partitura?ouvido=simulado&musica=ode-a-alegria&simular=0');
  const judgment = page.locator('[data-judgment]').first();
  await expect(judgment).toBeVisible({ timeout: 15000 });
  // A fila troca o elemento do julgamento a cada ~250 ms: toHaveCSS reconsulta, um evaluate num nó já desmontado lê ''
  await expect(judgment).toHaveCSS('animation-name', 'none');
});

test('joga uma música inteira em Partitura com ?simular', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/jogo/partitura?ouvido=simulado&musica=ode-a-alegria&simular=0');
  await expect(page.getByRole('region', { name: 'Partitura' })).toContainText(/compasso \d+ de 16/);
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: 70000 });
  const result = await lastResult(page);
  expect(result?.status).toBe('finished');
  expect(result?.counts.miss).toBe(0);
  if (page.url().endsWith('/selo-novo')) await page.getByRole('link', { name: /Ver resultado/ }).click();
  await expect(page.getByTestId('resultado')).toContainText('Partitura');
});

test('travadas da thread principal não viram "não tocada": o quadro de depois vem antes das leituras da fila', async ({ page }) => {
  test.setTimeout(90000);
  // A cada 2,5 s um quadro trava 800 ms antes do jogo rodar nele, como o aparelho lento montando a partitura; o ouvido
  // simulado (setInterval) só entrega as leituras de durante a travada depois desse quadro
  await page.addInitScript(() => {
    const w = window as Window & { __vhStalls?: number };
    const raf = window.requestAnimationFrame.bind(window);
    let due = performance.now() + 2500;
    w.__vhStalls = 0;
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        if (performance.now() >= due) {
          const end = performance.now() + 800;
          while (performance.now() < end);
          due = performance.now() + 2500;
          w.__vhStalls! += 1;
        }
        callback(time);
      });
  });
  await page.goto('/jogo/partitura?ouvido=simulado&musica=escala-re-maior');
  await expect(page).toHaveURL(/\/(selo-novo|resultado)$/, { timeout: 70000 });
  const result = await lastResult(page);
  expect(await page.evaluate(() => (window as Window & { __vhStalls?: number }).__vhStalls)).toBeGreaterThan(3);
  expect(result?.status).toBe('finished');
  expect(result?.judgments.filter((j) => j.judgment === 'miss').map((j) => `${j.index}:${j.issue}`)).toEqual([]);
});

test('prática com laço e velocidade do início ao fim com ?simular', async ({ page }) => {
  test.setTimeout(90000);
  await openWithState(page, '/pratica?ouvido=simulado&simular=0', { song: ODE, mode: 'Prática', practice: { loop: { startMeasure: 0, endMeasure: 1 }, speed: 1 } });
  await expect(page.getByText('PASSADA 2', { exact: true })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: '70%' }).click();
  await expect(page.getByRole('region', { name: 'Velocidade' })).toContainText('70 de 100 BPM');
  await expect(page.getByText('PASSADA 4', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /Sair da prática/ }).click();
  await expect(page).toHaveURL(/\/resultado$/, { timeout: 10000 });
  const result = await lastResult(page);
  expect(result?.laps.length).toBeGreaterThanOrEqual(3);
  expect(result?.laps.some((l) => l.factors.includes(0.7))).toBe(true);
  expect(result?.counts.miss).toBe(0);
  expect(result?.badges).toEqual([]);
  await expect(page.getByText('Partida de prática: sem selos e sem recorde.')).toBeVisible();
});

test('velocidade na pausa: avisa, a partida vira prática e o resultado diz que foi prática', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/jogo?ouvido=simulado&musica=escala-re-maior&simular=0');
  await page.waitForTimeout(3000);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await page.getByRole('button', { name: '85%' }).click();
  await page.getByRole('button', { name: 'Confirmar' }).click();
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page).toHaveURL(/\/resultado$/, { timeout: 70000 });
  const result = await lastResult(page);
  expect(result?.laps.length).toBeGreaterThan(0);
  expect(result?.badges).toEqual([]);
  await expect(page.getByText('Partida de prática: sem selos e sem recorde.')).toBeVisible();
});

test('resultado → "Praticar compassos" abre a prática no trecho mais difícil', async ({ page }) => {
  test.setTimeout(60000);
  await openWithState(page, '/resultado?ouvido=simulado', { song: ODE, mode: 'Arcade', result: played(5) });
  const label = await page.getByRole('region', { name: 'Trecho mais difícil' }).locator('span').first().textContent();
  const [, from, to] = /compassos? (\d+)(?:–(\d+))?/.exec(label ?? '') ?? [];
  await page.getByRole('link', { name: 'Praticar compassos' }).click();
  await expect(page).toHaveURL(/\/pratica$/, { timeout: 15000 });
  const title = to ? `Compassos ${from}–${to} em loop` : `Compasso ${from} em loop`;
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByRole('button', { name: '70%' })).toHaveAttribute('aria-pressed', 'true');
});
