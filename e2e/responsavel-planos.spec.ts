import { expect, test } from '@playwright/test';
import { launchWith } from './launch';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';

test.use({ launchOptions: launchWith() });

for (const theme of ['caderno', 'palco', '8-bits']) {
  for (const fallback of [false, true]) {
    test(`${theme}, fonte ${fallback ? 'reserva' : 'real'}: convite, progresso, áudio e planos`, async ({ page }) => {
      await page.addInitScript(id => localStorage.setItem('vh:theme', id), theme);
      if (fallback) await blockWebFonts(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/responsavel?turmas=simulada');
      await expect(page.getByText(/Nenhum filho vinculado/)).toBeVisible();
      await (fallback ? fallbackFontsReady(page, theme) : fontsReady(page, theme));
      await expectVisibleFocus(page);
      await page.getByLabel('Código do convite').fill('RESP222222');
      await page.getByRole('button', { name: 'Aceitar convite' }).click();
      await expect(page.getByRole('heading', { name: 'A semana de Ana' })).toBeAttached();
      // Nível e modo no cartão, como o professor vê
      await expect(page.getByRole('heading', { name: 'Brilha Brilha Estrelinha · Fácil · Arcade' })).toBeAttached();
      await page.getByRole('button', { name: 'Ouvir entrega' }).click();
      const audio = page.getByLabel('Entrega de Brilha Brilha Estrelinha');
      await expect(audio).toHaveAttribute('src', /^blob:/);
      await audio.evaluate(async (el: HTMLAudioElement) => { await el.play(); });
      await expect.poll(() => audio.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0);
      await expectFits(page);
      expect(await tooSmallTargets(page)).toEqual([]);
      expect(await tinyText(page)).toEqual([]);
      await page.goto('/planos?turmas=simulada');
      await expect(page.getByText('20 turmas × 40 alunos')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Assinatura chega em breve' })).toBeDisabled();
      // Sem conta de professor (aqui, sem rede): nada de "Seu plano: Grátis · 0 de 2 turmas abertas"
      await expect(page.getByText(/Seu plano/)).toHaveCount(0);
      await expectFits(page);
      expect(await tooSmallTargets(page)).toEqual([]);
      expect(await tinyText(page)).toEqual([]);
    });
  }
}
