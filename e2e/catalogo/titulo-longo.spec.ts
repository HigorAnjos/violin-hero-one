import { expect, test, type Page } from '@playwright/test';
import { blockWebFonts, fallbackFontsReady, fontsReady } from '../fonts';
import { expectFits, LONG_TITLE, tinyText, tooSmallTargets } from '../layout';
import { CATALOG } from './catalogo';

/**
 * Título longo vindo do catálogo nas telas que listam ou preparam a música (biblioteca, seleção, carregando), com a
 * fonte do app e com a reserva, nos dois temas, no desktop e no celular. O banco é o de verdade; só o título de uma
 * música é esticado na resposta do PostgREST. A escolha de modo não mostra título de música: nada a medir lá.
 */
const LONG_ID = 'greensleeves';

async function stretchTitle(page: Page) {
  await page.route(/\/rest\/v1\/songs\?/, async (route) => {
    const response = await route.fetch();
    const rows = (await response.json()) as { id: string; title: string }[];
    await route.fulfill({ response, json: rows.map((row) => (row.id === LONG_ID ? { ...row, title: LONG_TITLE } : row)) });
  });
}

const SCREENS = [
  {
    name: 'biblioteca',
    path: '/biblioteca',
    ready: (p: Page) => expect(p.getByRole('list', { name: 'Músicas' }).getByRole('link')).toHaveCount(CATALOG.length, { timeout: 15000 }),
  },
  {
    name: 'seleção de música',
    path: `/tocar/musica?modo=arcade&musica=${LONG_ID}`,
    ready: (p: Page) => expect(p.getByRole('complementary', { name: 'Detalhes da música' })).toContainText(LONG_TITLE, { timeout: 15000 }),
  },
  {
    // A partitura não chega (get_song preso): a tela fica no "Preparando" com o título da ficha do catálogo
    name: 'carregando',
    path: `/tocar/carregando?modo=arcade&musica=${LONG_ID}&nivel=medio`,
    hold: true,
    ready: (p: Page) => expect(p.getByRole('heading', { level: 1 })).toHaveText(LONG_TITLE, { timeout: 15000 }),
  },
];

for (const tema of ['caderno', 'palco'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
        await stretchTitle(page);
      });

      for (const screen of SCREENS) {
        test(`${screen.name} com título longo do catálogo cabe na tela`, async ({ page }) => {
          if (screen.hold) await page.route(/\/rest\/v1\/rpc\/get_song/, () => undefined);
          await page.goto(screen.path);
          await screen.ready(page);
          await (fonte === 'real' ? fontsReady(page) : fallbackFontsReady(page));
          await expectFits(page);
          expect(await tooSmallTargets(page), 'alvos de toque abaixo de 44 px').toEqual([]);
          expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
        });
      }
    });
  }
}
