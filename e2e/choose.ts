import { expect, type Page } from '@playwright/test';

/** Marca a primeira vez como feita (antes de abrir a página): a raiz abre a tela inicial. */
export async function skipOnboarding(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
}

/** Da tela inicial até afinar, como o jogador: Tocar → modo → música → Tocar. Termina em /afinar. */
export async function chooseSong(page: Page, title: string | RegExp, mode: 'Arcade' | 'Partitura' = 'Arcade') {
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /^Tocar/ }).click();
  await expect(page).toHaveURL(/\/tocar$/);
  if (mode !== 'Arcade') await page.getByRole('radio', { name: mode }).click();
  await page.getByRole('button', { name: new RegExp(`Continuar com ${mode}`) }).click();
  await page.getByRole('radiogroup', { name: 'Músicas' }).getByRole('radio', { name: title }).click();
  await page.getByRole('complementary', { name: 'Detalhes da música' }).getByRole('link', { name: /Tocar/ }).click();
  await expect(page).toHaveURL(/\/afinar(\?.*)?$/);
}
