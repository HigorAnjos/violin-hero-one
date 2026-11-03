import { expect, test, type Page } from '@playwright/test';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, overlappingTargets, tinyText, tooSmallTargets } from './layout';

// A política é pública: abre sem sessão e sem onboarding (as fichas das lojas e o rodapé do site linkam para ela)
const ready = (page: Page) => expect(page.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeVisible();

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      test('política de privacidade cabe na tela (o texto rola por dentro), com toque de 44 px e texto de 12 px', async ({ page }) => {
        await page.goto('/privacidade');
        await ready(page);
        await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        await expectFits(page);
        expect(await tooSmallTargets(page)).toEqual([]);
        expect(await overlappingTargets(page), 'controles sobrepostos').toEqual([]);
        expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
        // O fim do texto (contato) é alcançável rolando o artigo
        const contact = page.getByRole('region', { name: 'Contato' });
        await contact.scrollIntoViewIfNeeded();
        await expect(contact).toBeInViewport();
      });
    });
  }
}

test('foco visível no teclado', async ({ page }) => {
  await page.goto('/privacidade');
  await ready(page);
  await expectVisibleFocus(page);
});

test('o Entrar leva à política, e ela volta ao menu', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByRole('link', { name: 'Política de privacidade' }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await ready(page);
  await expect(page.getByRole('region', { name: 'Microfone' })).toContainText('só para ouvir o violino');
  await page.getByRole('link', { name: /Menu/ }).click();
  await expect(page).not.toHaveURL(/\/privacidade$/);
});

test('Configurações › Conta leva à política', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vh:profile', JSON.stringify({ level: 'beginner', nickname: 'Lia', animal: 'fox' })));
  await page.goto('/configuracoes?secao=conta');
  await page.getByRole('link', { name: 'Política de privacidade' }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await ready(page);
});
