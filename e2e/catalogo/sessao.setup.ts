import { expect, test as setup } from '@playwright/test';
import { SESSION } from './sessao';

// A tela inicial pede o catálogo, que pede sessão: o app entra como anônimo e grava o token no localStorage.
// O primeiro signup do GoTrue local recém-subido leva ~8 s; os seguintes, meio segundo.
setup('login anônimo no Supabase local', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vh:onboarded', '1'));
  await page.goto('/');
  await expect
    .poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => /^sb-.+-auth-token$/.test(key))), {
      message: 'token da sessão anônima',
      timeout: 25000,
    })
    .toBe(true);
  await expect(page.getByRole('status').filter({ hasText: 'Jogando como convidado' })).toBeVisible();
  await page.context().storageState({ path: SESSION });
});
