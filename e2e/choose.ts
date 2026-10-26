import { expect, type Page } from '@playwright/test';
import { LEVEL_NAMES } from '../src/components/CountIn/countIn';
import type { Level } from '../src/game/notation/song';

/** Marca a primeira vez como feita (antes de abrir a página): a raiz abre a tela inicial. */
export async function skipOnboarding(page: Page) {
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
}

/**
 * Da tela inicial até afinar, como o jogador: Tocar → modo → música → nível → Tocar. Termina em /afinar. Sem nível,
 * fica o que a tela já escolheu.
 */
export async function chooseSong(page: Page, title: string | RegExp, mode: 'Arcade' | 'Partitura' | 'Cordas 3D' = 'Arcade', level?: Level) {
  await page.getByRole('navigation', { name: 'Menu principal' }).getByRole('link', { name: /^Tocar/ }).click();
  await expect(page).toHaveURL(/\/tocar$/);
  if (mode !== 'Arcade') await page.getByRole('radio', { name: mode }).click();
  await page.getByRole('button', { name: new RegExp(`Continuar com ${mode}`) }).click();
  await page.getByRole('radiogroup', { name: 'Músicas' }).getByRole('radio', { name: title }).click();
  const details = page.getByRole('complementary', { name: 'Detalhes da música' });
  if (level) {
    const button = details.getByRole('button', { name: LEVEL_NAMES[level], exact: true });
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  await details.getByRole('link', { name: /Tocar/ }).click();
  // O carregando busca o chart (get_song, quando há banco): a primeira chamada ao Supabase local recém-subido demora
  await expect(page).toHaveURL(/\/afinar(\?.*)?$/, { timeout: 15000 });
}
