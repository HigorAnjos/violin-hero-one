import { expect, test } from '@playwright/test';
import { skipOnboarding } from './choose';
import { fontsReady } from './fonts';

test('primeira vez: a raiz leva às boas-vindas e "Começar a tocar" ao onboarding, sem cadastro', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await page.getByRole('link', { name: /Começar a tocar/ }).click();
  await expect(page).toHaveURL(/\/primeira-vez\/nivel$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quanto você já toca?');
});

test.describe('depois da primeira vez', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page);
    await page.goto('/');
  });

  test('a raiz é a tela inicial, com o título Violin Hero e o menu', async ({ page }) => {
    await expect(page).toHaveTitle('Violin Hero');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Violin\s*Hero/);
    const menu = page.getByRole('navigation', { name: 'Menu principal' });
    await expect(menu.getByRole('link', { name: /^Tocar/ })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Biblioteca 3' })).toBeVisible();
    await expect(menu.getByRole('link', { name: /^Afinar Lá 442/ })).toBeVisible();
  });

  test('a /teste não existe mais: volta para a raiz', async ({ page }) => {
    await page.goto('/teste');
    await expect(page).toHaveURL(/\/$/);
  });

  test('sem Supabase a sessão fica Offline', async ({ page }) => {
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
  });

  test('trocar para o tema Palco pelas Configurações › Visual, e ele fica na volta', async ({ page }) => {
    await page.getByRole('link', { name: 'Configurações' }).click();
    await page.getByRole('link', { name: 'Visual' }).click();
    const palco = page.getByRole('radiogroup', { name: 'Temas' }).getByRole('radio', { name: /^Palco/ });
    await palco.click();
    await expect(palco).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'palco');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'palco');
  });

  test('não rola na horizontal', async ({ page }) => {
    await fontsReady(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
