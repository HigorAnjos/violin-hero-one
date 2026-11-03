import { expect, test, type Page } from '@playwright/test';
import { stageBox } from '../src/game/render/layout';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectArrowsAligned, expectFits, expectVisibleFocus, overlappingTargets, tinyText, tooSmallTargets } from './layout';

// A partida começa sozinha (contagem e áudio sem gesto do jogador)
test.use({ launchOptions: launchWith('--autoplay-policy=no-user-gesture-required') });

/**
 * As quatro telas do design de celular (MobileMain, MobileLibrary, MobileCalibration, MobileGameplay): no projeto
 * celular (844×390) valem os layouts do celular, no desktop (1280×720) os de sempre. Sem SUPABASE_* no build do e2e,
 * a estante são as 3 músicas do app.
 */
const SCREENS = [
  { name: 'inicial', path: '/', ready: (p: Page) => expect(p.getByRole('navigation', { name: 'Menu principal' })).toBeVisible() },
  { name: 'biblioteca', path: '/biblioteca', ready: (p: Page) => expect(p.getByRole('list', { name: 'Músicas' }).getByRole('link')).toHaveCount(3) },
  {
    name: 'afinar',
    path: '/afinar?ouvido=simulado&musica=escala-re-maior',
    ready: (p: Page) => expect(p.getByRole('region', { name: 'Afinador' })).toBeVisible(),
  },
  {
    name: 'jogo',
    path: '/jogo?ouvido=simulado&musica=escala-re-maior',
    ready: async (p: Page) => {
      await expect(p.getByTestId('pista').locator('canvas')).toBeAttached();
      await expect(p.getByRole('button', { name: 'Pausar' })).toBeEnabled({ timeout: 10000 });
    },
  },
];

const compact = (page: Page) => page.viewportSize()!.height <= 500;

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const screen of SCREENS) {
        test(`${screen.name}: cabe, sem sobrepor, com toque de 44 px e texto de 12 px`, async ({ page }) => {
          await page.emulateMedia({ reducedMotion: 'reduce' });
          await page.goto(screen.path);
          await screen.ready(page);
          await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
          await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
          await expectFits(page);
          expect(await tooSmallTargets(page), 'toque abaixo de 44 px').toEqual([]);
          expect(await overlappingTargets(page), 'controles sobrepostos').toEqual([]);
          expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
          // A inicial empilha o menu (sem vizinhos na linha) e o jogo não tem botão com seta
          if (screen.name === 'biblioteca' || screen.name === 'afinar') await expectArrowsAligned(page);
        });
      }

      test('biblioteca: a lupa do celular abre a busca e a ordem sem cortar nada', async ({ page }) => {
        test.skip(!compact(page), 'a lupa é só do celular deitado; no desktop a busca fica sempre na barra');
        await page.goto('/biblioteca');
        await SCREENS[1].ready(page);
        await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
        const search = page.getByRole('searchbox', { name: 'Buscar na biblioteca' });
        await expect(search).toBeHidden();
        await page.getByRole('button', { name: 'Buscar' }).click();
        await expect(search).toBeFocused();
        await expect(page.getByRole('combobox', { name: 'Ordenar' })).toBeVisible();
        await expectFits(page);
        expect(await tooSmallTargets(page)).toEqual([]);
        expect(await overlappingTargets(page)).toEqual([]);
        await search.fill('ode');
        await expect(page.getByRole('list', { name: 'Músicas' }).getByRole('link')).toHaveCount(1);
      });

      test('afinar: o "···" do celular mostra o −/+ e o 415 na linha do afinador', async ({ page }) => {
        test.skip(!compact(page), 'o "···" é só do celular deitado');
        await page.goto(SCREENS[2].path);
        await SCREENS[2].ready(page);
        await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
        await expect(page.getByRole('button', { name: 'Diminuir 1 Hz' })).toBeHidden();
        await page.getByRole('button', { name: 'Outro Lá' }).click();
        await expect(page.getByRole('button', { name: 'Diminuir 1 Hz' })).toBeVisible();
        await expect(page.getByRole('button', { name: '415 barroco' })).toBeVisible();
        await expect(page.getByRole('button', { name: '442', exact: true })).toBeHidden();
        await expectFits(page);
        expect(await tooSmallTargets(page)).toEqual([]);
        expect(await overlappingTargets(page)).toEqual([]);
        // Mesma linha do "Afinador" e do voltar
        const back = (await page.getByRole('region', { name: 'Afinador' }).getByRole('link', { name: 'Voltar' }).boundingBox())!;
        const minus = (await page.getByRole('button', { name: 'Diminuir 1 Hz' }).boundingBox())!;
        expect(Math.abs(back.y + back.height / 2 - (minus.y + minus.height / 2)), 'Lá na linha do afinador').toBeLessThan(4);
      });
    });
  }
}

for (const screen of SCREENS) {
  test(`${screen.name}: foco visível no teclado`, async ({ page }) => {
    await page.goto(screen.path);
    await screen.ready(page);
    await expectVisibleFocus(page);
  });
}

test('jogo: a pista só muda de tamanho e posição, na caixa do design (stageBox)', async ({ page }) => {
  await page.goto(SCREENS[3].path);
  await SCREENS[3].ready(page);
  const { width, height } = page.viewportSize()!;
  const box = (await page.getByTestId('pista').boundingBox())!;
  expect({ x: box.x, y: box.y, width: box.width, height: box.height }).toEqual(stageBox(width, height));
  if (compact(page)) expect(stageBox(width, height)).toEqual({ x: 202, y: 0, width: 440, height: 272 });
  // Celular: placar à esquerda, pausar e afinação à direita, sem cobrir a pista
  const score = (await page.getByRole('region', { name: 'Placar' }).boundingBox())!;
  const tuning = (await page.getByRole('region', { name: 'Afinação' }).boundingBox())!;
  if (compact(page)) {
    expect(score.x + score.width, 'placar fora da pista').toBeLessThanOrEqual(box.x);
    expect(tuning.x, 'afinação fora da pista').toBeGreaterThanOrEqual(box.x + box.width);
    await expect(page.getByRole('region', { name: 'Afinação' }).getByRole('img', { name: /^Afinação:/ })).toBeVisible();
  }
});

test('inicial: no celular, botões redondos no alto e o estado no canto de baixo', async ({ page }) => {
  test.skip(!compact(page), 'layout do celular deitado');
  await page.goto('/');
  await SCREENS[0].ready(page);
  const { height } = page.viewportSize()!;
  const status = (await page.getByRole('status').filter({ hasText: 'Offline' }).boundingBox())!;
  const ranking = (await page.getByRole('link', { name: 'Ranking' }).boundingBox())!;
  expect(ranking.y, 'ranking no alto').toBeLessThan(24);
  expect(height - (status.y + status.height), 'estado no canto de baixo').toBeLessThan(24);
});
