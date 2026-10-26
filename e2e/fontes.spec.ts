import { expect, test, type Page } from '@playwright/test';
import { simulateGame, type GameResult } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits } from './layout';
import { openWithState } from './state';

test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

const LONG_TITLE = 'Concerto para Violino em Mi Menor, Op. 64 — Allegro molto appassionato (versão completa com cadência)';
const SONG = { ...ODE, title: LONG_TITLE };

/** Partida de verdade com os números inchados: pontuação de 7 dígitos e combo de 5. */
function bigResult(errors: number, noFail = true): GameResult {
  const result = simulateGame({ song: ODE, startAt: 1, noFail }, { errors, seed: 2 }).result;
  return { ...result, score: 9876543, maxCombo: 12345 };
}

/**
 * Botões com ▸ ou ◂ (fora do subset latin, desenhados por outra fonte): a seta não muda a altura do botão
 * (medida com e sem ela) e fica no meio do texto, na mesma linha dos botões vizinhos.
 */
async function arrowButtons(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href]')]
      .filter((el) => el.offsetParent !== null && /[▸◂]/.test(el.textContent ?? ''))
      .map((el) => {
        const arrow = [...el.querySelectorAll('[aria-hidden="true"]')].find((s) => /^[▸◂]$/.test((s.textContent ?? '').trim()))!;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let text: DOMRect | null = null;
        while (!text && walker.nextNode()) {
          const node = walker.currentNode;
          if (arrow.contains(node) || !node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          text = range.getBoundingClientRect();
        }
        const range = document.createRange();
        range.selectNodeContents(arrow);
        const a = range.getBoundingClientRect();
        const mid = (r: DOMRect) => (r.top + r.bottom) / 2;
        const box = el.getBoundingClientRect();
        (arrow as HTMLElement).style.display = 'none';
        const without = el.getBoundingClientRect().height;
        (arrow as HTMLElement).style.display = '';
        const neighbors = [...(el.parentElement?.children ?? [])].filter((s) => s !== el && s.matches('button, a[href]'));
        const half = (n: number) => Math.round(n * 2) / 2;
        return {
          label: (el.textContent ?? '').trim(),
          growth: half(box.height - without),
          offset: text ? half(Math.abs(mid(a) - mid(text))) : 0,
          rowShift: half(Math.max(0, ...neighbors.map((s) => Math.abs(mid(s.getBoundingClientRect()) - mid(box))))),
        };
      })
  );
}

async function expectArrowsAligned(page: Page) {
  const buttons = await arrowButtons(page);
  expect(buttons.length, 'botões com seta na tela').toBeGreaterThan(0);
  for (const b of buttons) {
    expect(b.growth, `altura que a seta acrescenta a "${b.label}" (px)`).toBe(0);
    expect(b.offset, `seta de "${b.label}" fora do meio do texto (px)`).toBeLessThanOrEqual(2);
    expect(b.rowShift, `"${b.label}" desalinhado dos botões vizinhos (px)`).toBeLessThanOrEqual(0.5);
  }
}

for (const fonte of ['real', 'reserva'] as const) {
  test.describe(`fonte ${fonte}`, () => {
    const ready = async (page: Page) => (fonte === 'real' ? fontsReady(page) : fallbackFontsReady(page));

    test.beforeEach(async ({ page }) => {
      if (fonte === 'reserva') await blockWebFonts(page);
    });

    test('resultado com título longo e números grandes cabe sem rolar', async ({ page }) => {
      await openWithState(page, '/resultado', { song: SONG, mode: 'Arcade', result: bigResult(3) });
      await expect(page.getByTestId('resultado')).toBeVisible();
      await ready(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(LONG_TITLE);
      await expect(page.getByLabel('Pontuação')).toContainText('9.876.543');
      await expectFits(page);
      await expectArrowsAligned(page);
      // As reticências são a rede de segurança: pontos, combo de 5 dígitos e rótulos ainda cabem inteiros
      const cut = await page.evaluate(() =>
        [...document.querySelectorAll('[aria-label="Pontuação"] > span, dt, dd')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent)
      );
      expect(cut, 'números e rótulos cortados por reticências').toEqual([]);
    });

    test('a orquestra parou com título longo e pontuação grande', async ({ page }) => {
      await openWithState(page, '/orquestra-parou', { song: SONG, result: bigResult(16, false) });
      await expect(page.getByRole('heading', { name: 'A orquestra parou… por hoje!' })).toBeVisible();
      await ready(page);
      await expectFits(page);
    });

    test('selo novo com título longo', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openWithState(page, '/selo-novo', { song: SONG, result: { ...bigResult(0), badges: ['primeira-musica', 'combo-25'] } });
      await expect(page.getByRole('heading', { name: 'Selo novo: Combo 25' })).toBeVisible();
      await ready(page);
      await expectFits(page);
      await expectArrowsAligned(page);
    });

    test('contagem com título longo', async ({ page }) => {
      await openWithState(page, '/contagem', { song: SONG, mode: 'Arcade', next: '/jogo' });
      await ready(page);
      await expectFits(page);
      await expectArrowsAligned(page);
    });

    test('afinação com título longo', async ({ page }) => {
      await openWithState(page, '/afinar?ouvido=simulado', { song: SONG, mode: 'Arcade' });
      await expect(page.getByRole('region', { name: 'Afinador' })).toBeVisible();
      await ready(page);
      await expectFits(page);
      await expectArrowsAligned(page);
    });

    test('pausa com título longo', async ({ page }) => {
      await openWithState(page, '/jogo?ouvido=simulado', { song: SONG, mode: 'Arcade' });
      await page.getByRole('button', { name: 'Pausar' }).click();
      await expect(page.getByRole('dialog', { name: 'PAUSADO' })).toBeVisible();
      await ready(page);
      await expectFits(page);
    });

    test('botões com seta no nível', async ({ page }) => {
      await page.goto('/primeira-vez/nivel');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quanto você já toca?');
      await ready(page);
      await expectArrowsAligned(page);
    });
  });
}

test('a partitura da Gameplay desenha a clave e os acidentes com a Noto Music servida pelo app', async ({ page }) => {
  const font = page.waitForResponse((r) => /noto-music-music-400-normal-.*\.woff2$/.test(r.url()));
  await page.goto('/jogo?ouvido=simulado&musica=escala-re-maior');
  await expect(page.getByTestId('pista')).toBeAttached();
  const response = await font;
  expect(response.ok()).toBe(true);
  expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin);
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('400 60px "Noto Music"', '𝄞♯♭');
    return document.fonts.check('400 60px "Noto Music"', '𝄞♯♭');
  });
  expect(loaded).toBe(true);
});
