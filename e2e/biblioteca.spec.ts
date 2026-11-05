import { expect, test, type Page } from '@playwright/test';
import { ODE } from '../src/game/engine/testing';
import { DEVICE_DB_NAME, DEVICE_DB_VERSION, SONGS_STORE } from '../src/services/deviceDb';
import type { CachedSong } from '../src/services/songCache';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectFitsWidth, LONG_TITLE, overlappingTargets, tinyText, tooSmallTargets } from './layout';

/**
 * Biblioteca com o celular deitado: a estante vira uma grade de colunas que rola na vertical, só a área da lista,
 * com o cabeçalho e os filtros parados no alto. As 3 embutidas e mais 14 baixadas (o build do e2e não tem Supabase)
 * passam da altura da tela nos dois tamanhos.
 */
const SIZES = [
  { width: 844, height: 390, columns: 4 },
  { width: 932, height: 430, columns: 5 },
];

const baixada = (n: number): CachedSong => {
  const title = n === 1 ? LONG_TITLE : `Estudo ${n}`;
  const id = `estudo-${n}`;
  return {
    userId: 'jogador-do-aparelho',
    id,
    level: 'medium',
    hash: 'a'.repeat(64),
    sheet: { id, title, composer: 'Tradicional', bpm: 90, timeSignature: { beats: 3, unit: 4 }, key: 'A minor', durationSeconds: 70, origin: 'catalog' },
    song: { ...ODE, id, title, level: 'medium' },
    savedAt: n,
    openedAt: n,
  };
};
const BAIXADAS = Array.from({ length: 14 }, (_, i) => baixada(i + 1));
const TOTAL = BAIXADAS.length + 3;

/** Grava as baixadas no IndexedDB como o app gravaria (o app cria os stores na primeira visita) e recarrega. */
async function openShelf(page: Page) {
  await page.goto('/biblioteca');
  await page.evaluate(
    ([name, version, store, entries]) =>
      new Promise<void>((resolve, reject) => {
        localStorage.setItem('vh:usuario', entries[0].userId);
        const open = indexedDB.open(name, version);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction(store, 'readwrite');
          for (const entry of entries) tx.objectStore(store).put(entry);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
      }),
    [DEVICE_DB_NAME, DEVICE_DB_VERSION, SONGS_STORE, BAIXADAS] as const
  );
  await page.reload();
  await expect(cards(page)).toHaveCount(TOTAL);
}

const grid = (page: Page) => page.getByRole('list', { name: 'Músicas' });
const cards = (page: Page) => grid(page).getByRole('link');

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'celular', 'layout do celular deitado; desktop e em pé ficam como estavam');
  await skipOnboarding(page);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    for (const size of SIZES) {
      test(`${tema}, fonte ${fonte}, ${size.width}×${size.height}: ${size.columns} colunas que rolam na vertical, nada cortado`, async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
        await page.setViewportSize({ width: size.width, height: size.height });
        await openShelf(page);
        await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);

        // A página não rola: quem rola é a lista, só na vertical
        await expectFits(page);
        await expectFitsWidth(page);
        const scroll = await grid(page).evaluate((el) => ({ x: el.scrollWidth - el.clientWidth, y: el.scrollHeight - el.clientHeight }));
        expect(scroll.x, 'rolagem horizontal da grade').toBeLessThanOrEqual(0);
        expect(scroll.y, 'a lista rola na vertical').toBeGreaterThan(0);

        const boxes = await cards(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON() as DOMRect));
        expect(boxes.filter((b) => Math.abs(b.y - boxes[0].y) < 1), 'cartões na primeira linha').toHaveLength(size.columns);
        expect(Math.min(...boxes.map((b) => b.width)), 'largura do cartão (px)').toBeGreaterThanOrEqual(160);

        // Lista abaixo dos filtros, sem cobrir nada
        const filters = (await page.getByRole('group', { name: 'Filtro' }).boundingBox())!;
        const list = (await grid(page).boundingBox())!;
        expect(list.y, 'lista abaixo dos filtros').toBeGreaterThanOrEqual(filters.y + filters.height);
        expect(await tooSmallTargets(page), 'toque abaixo de 44 px').toEqual([]);
        expect(await overlappingTargets(page), 'controles sobrepostos').toEqual([]);
        expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);

        // Até o fim: o último cartão inteiro à vista e o cabeçalho e os filtros no mesmo lugar
        const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
        await grid(page).evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await expect(cards(page).last()).toBeInViewport({ ratio: 1 });
        const last = (await cards(page).last().boundingBox())!;
        expect(last.y + last.height, 'último cartão dentro da lista').toBeLessThanOrEqual(list.y + list.height + 0.5);
        expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.y, 'cabeçalho parado').toBe(title.y);
        expect((await page.getByRole('group', { name: 'Filtro' }).boundingBox())!.y, 'filtros parados').toBe(filters.y);
        expect(await overlappingTargets(page), 'controles sobrepostos no fim da lista').toEqual([]);
      });
    }
  }
}

for (const size of SIZES) {
  test(`${size.width}×${size.height}: o Tab chega a todo cartão, à vista e com o foco visível`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await openShelf(page);
    const ids = await cards(page).evaluateAll((els) => els.map((el) => el.getAttribute('href')));
    const reached: string[] = [];
    for (let i = 0; i < 60 && reached.length < ids.length; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        if (!el.closest('[aria-label="Músicas"]')) return null;
        const box = el.getBoundingClientRect();
        const list = el.closest('ul')!.getBoundingClientRect();
        return { href: el.getAttribute('href'), outline: getComputedStyle(el).outlineStyle, inside: box.top >= list.top - 0.5 && box.bottom <= list.bottom + 0.5 };
      });
      if (!focused) continue;
      expect(focused.outline, `foco visível em ${focused.href}`).toBe('solid');
      expect(focused.inside, `${focused.href} à vista ao receber o foco`).toBe(true);
      reached.push(focused.href!);
    }
    expect(reached).toEqual(ids);
  });
}
