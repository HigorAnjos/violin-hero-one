import { expect, test } from '@playwright/test';

test('tela inicial abre com o título Violin Hero', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Violin Hero');
});
