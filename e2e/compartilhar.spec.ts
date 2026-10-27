import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { simulateGame } from '../src/game/engine';
import { ODE } from '../src/game/engine/testing';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';
import { openWithState } from './state';

// Sem Supabase (prévia sem backend): o cartão sai do aparelho mesmo assim; o desafio avisa que precisa de internet
const RESULT = { ...simulateGame({ song: ODE, startAt: 1 }, { errors: 0, seed: 2 }).result, badges: ['primeira-musica', 'sem-erros'] };

/** Largura e altura de um PNG (cabeçalho IHDR). */
const pngSize = (png: Buffer) => [png.readUInt32BE(16), png.readUInt32BE(20)];

for (const tema of ['caderno', 'palco', '8-bits', 'neon']) {
  test(`${tema}: QR do PNG inteiro decodifica a 1080 e 540 px`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
    await withoutFileShare(page);
    await openWithState(page, '/resultado', { song: ODE, mode: 'Arcade', result: RESULT });
    await page.addScriptTag({ path: 'node_modules/jsqr/dist/jsQR.js' });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Compartilhar' }).click();
    const png = await readFile(await (await download).path());
    const decoded = await page.evaluate(async (base64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const decode = (window as unknown as { jsQR: (pixels: Uint8ClampedArray, width: number, height: number, options: { inversionAttempts: string }) => { data: string } | null }).jsQR;
      return [1080, 540].map((width) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = width * 1350 / 1080;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        return decode(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' })?.data;
      });
    }, png.toString('base64'));
    expect(decoded).toEqual([`https://${new URL(page.url()).host}`, `https://${new URL(page.url()).host}`]);
  });
}

/** Sem Web Share de arquivo (o Chromium do Linux não tem): o Compartilhar baixa o PNG. */
async function withoutFileShare(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'canShare', { value: () => false, configurable: true }));
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`${tema}, fonte ${fonte}: Compartilhar do resultado baixa o cartão 1080×1350 e a tela continua cabendo`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      await withoutFileShare(page);
      await openWithState(page, '/resultado', { song: ODE, mode: 'Arcade', result: RESULT });
      await expect(page.getByTestId('resultado')).toBeVisible();
      await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
      await expect(page.getByRole('link', { name: /Desafiar/ })).toHaveAttribute('href', '/desafio');
      await expectFits(page);
      expect(await tooSmallTargets(page)).toEqual([]);
      expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);

      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Compartilhar' }).click();
      const file = await download;
      expect(file.suggestedFilename()).toBe('violin-hero-ode-a-alegria.png');
      const png = await readFile(await file.path());
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      expect(pngSize(png)).toEqual([1080, 1350]);
      await expect(page.getByRole('status').filter({ hasText: 'Imagem salva no aparelho.' })).toBeAttached();
    });
  }
}

test('com Web Share de arquivo: o cartão vai pela folha do aparelho, sem baixar', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { shared?: unknown };
    Object.defineProperty(navigator, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d: { files: File[]; title: string }) => {
        const bitmap = await createImageBitmap(d.files[0]);
        w.shared = { name: d.files[0].name, type: d.files[0].type, title: d.title, size: [bitmap.width, bitmap.height] };
      },
    });
  });
  let downloaded = false;
  page.on('download', () => (downloaded = true));
  await openWithState(page, '/resultado', { song: ODE, mode: 'Arcade', result: RESULT });
  await page.getByRole('button', { name: 'Compartilhar' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { shared?: unknown }).shared)).toEqual({
    name: 'violin-hero-ode-a-alegria.png',
    type: 'image/png',
    title: 'Ode à Alegria · Violin Hero',
    size: [1080, 1350],
  });
  expect(downloaded).toBe(false);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    for (const path of ['/desafio', '/desafio/Ab3_k9-ZxQ2w']) {
      test(`${tema}, fonte ${fonte}: ${path} sem conexão cabe na tela, com toque de 44 px e texto de 12 px`, async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
        await page.goto(path);
        await expect(page.getByRole('status').first()).toHaveText(/Sem conexão\. Desafios precisam de internet\./);
        await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
        await expectFits(page);
        expect(await tooSmallTargets(page)).toEqual([]);
        expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
      });
    }
  }
}

test('desafio: foco visível no teclado', async ({ page }) => {
  await page.goto('/desafio');
  await expect(page.getByRole('heading', { name: 'Desafiar um amigo' })).toBeVisible();
  await expectVisibleFocus(page);
});
