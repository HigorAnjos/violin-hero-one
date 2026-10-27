import { expect, test, type Page } from '@playwright/test';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';

// Build sem Supabase: sem provedor Google e sem sessão. O fluxo de verdade (link mágico) fica no e2e/catalogo/conta.spec.ts
const SCREENS = [
  { name: 'boas-vindas', path: '/entrar', ready: (p: Page) => expect(p.getByRole('heading', { name: 'Como você quer começar?' })).toBeVisible() },
  {
    name: 'conta só quando precisa',
    path: '/conta?motivo=ranking&depois=%2F&voltar=%2Fperfil',
    ready: (p: Page) => expect(p.getByRole('dialog', { name: 'Quer aparecer no ranking, Maria Eduarda Pizzicato?' })).toBeVisible(),
  },
  { name: 'configurações · conta', path: '/configuracoes?secao=conta', ready: (p: Page) => expect(p.getByRole('region', { name: 'Conta' })).toBeVisible() },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vh:profile', JSON.stringify({ level: 'beginner', nickname: 'Maria Eduarda Pizzicato', animal: 'fox' }));
    localStorage.setItem('vh:recordes', JSON.stringify({ 'ode-a-alegria:easy': 1234567, 'escala-re-maior:easy': 845000 }));
  });
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const screen of SCREENS) {
        test(`${screen.name} cabe na tela, com toque de 44 px e texto de 12 px`, async ({ page }) => {
          await page.goto(screen.path);
          await screen.ready(page);
          await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
          await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
          await expectFits(page);
          expect(await tooSmallTargets(page)).toEqual([]);
          expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
        });
      }

      test('boas-vindas com o campo de e-mail aberto cabe na tela', async ({ page }) => {
        await page.goto('/entrar');
        await page.getByRole('button', { name: 'Entrar com e-mail' }).click();
        await expect(page.getByLabel('E-mail')).toBeFocused();
        await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
        await expectFits(page);
        expect(await tooSmallTargets(page)).toEqual([]);
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

test('sem provedor Google no projeto, o botão do Google não aparece', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByRole('button', { name: 'Entrar com e-mail' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
});

test('"Agora não" volta para onde a conta foi pedida', async ({ page }) => {
  await page.goto(SCREENS[1].path);
  await page.getByRole('link', { name: 'Agora não' }).click();
  await expect(page).toHaveURL(/\/perfil$/);
});

test('reduzir movimento: nada anda nas telas da conta', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await screen.ready(page);
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('main *')]
        .map((el) => getComputedStyle(el))
        .filter((s) => s.animationName !== 'none' && parseFloat(s.animationDuration) > 0)
        .map((s) => s.animationName)
    );
    expect(moving, screen.name).toEqual([]);
  }
});
