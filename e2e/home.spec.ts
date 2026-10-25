import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/teste');
});

test('primeira vez: a raiz leva ao onboarding', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/primeira-vez\/nivel$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Quanto você já toca?');
});

test('tela de teste mostra o título Violin Hero', async ({ page }) => {
  await expect(page).toHaveTitle('Violin Hero');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Violin\s*Hero/);
});

test('mostra as quatro cordas do violino', async ({ page }) => {
  await expect(page.getByRole('list', { name: 'Cordas do violino' }).getByRole('listitem')).toHaveCount(4);
});

test('sem Supabase a sessão fica Offline', async ({ page }) => {
  await expect(page.getByRole('status')).toHaveText('Offline');
});

test('trocar para o tema Palco', async ({ page }) => {
  const palco = page.getByRole('group', { name: 'Tema' }).getByRole('button', { name: 'Palco' });
  await palco.click();
  await expect(palco).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'palco');
});

test('não rola na horizontal', async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
