import { expect, test } from '@playwright/test';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectArrowsAligned, expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';

// Sem Supabase (prévia sem backend) o ranking mostra o aviso de sem conexão; a lista cheia fica no e2e/catalogo/ranking.spec.ts
test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  await page.addInitScript(() => localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica', 'combo-25'])));
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`${tema}, fonte ${fonte}: ranking sem conexão cabe na tela, com toque de 44 px e texto de 12 px`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      await page.goto('/ranking?musica=ode-a-alegria&nivel=medio');
      await expect(page.getByRole('status')).toHaveText(/Sem conexão\. O ranking precisa de internet/);
      await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      await expectFits(page);
      expect(await tooSmallTargets(page)).toEqual([]);
      expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
    });
  }
}

test('da tela inicial ao ranking pelo troféu; música, nível e período ficam no endereço', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Ranking' }).click();
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('combobox', { name: 'Música' }).selectOption({ label: 'Ode à Alegria' });
  await page.getByRole('combobox', { name: 'Nível' }).selectOption({ label: 'Difícil' });
  await page.getByRole('button', { name: 'Geral' }).click();
  await expect(page).toHaveURL(/\/ranking\?musica=ode-a-alegria&nivel=dificil&periodo=geral$/);
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Nível' })).toHaveValue('hard');
  await expectArrowsAligned(page);
  await page.getByRole('link', { name: /Menu/ }).click();
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
});

test('ranking: foco visível no teclado', async ({ page }) => {
  await page.goto('/ranking');
  await expect(page.getByRole('heading', { name: 'Ranking' })).toBeVisible();
  await expectVisibleFocus(page);
});
