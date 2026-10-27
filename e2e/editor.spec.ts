import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, tinyText, tooSmallTargets } from './layout';

// O e2e roda sem backend: ?importacao=simulada troca a Edge Function (floor ciclo4-import-funcao) pelo fake
const EDITOR = '/editor?importacao=simulada';

const staff = (page: Page) => page.getByRole('group', { name: /Pauta/ });
const notes = (page: Page) => page.getByTestId('nota');

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test('escala de Ré maior: escrever, ouvir, salvar e abrir na escolha de modo', async ({ page }) => {
  await page.goto(EDITOR);
  // Título diferente da escala embutida no app: a seleção mostra as duas
  await page.getByRole('textbox', { name: 'Título da música' }).fill('Minha escala de Ré');
  await staff(page).focus();
  await page.keyboard.type('defgabcd');
  await expect(notes(page)).toHaveCount(8);
  const panel = page.getByRole('region', { name: 'Nota selecionada' });
  await expect(panel).toContainText('Ré5');
  await expect(page.getByText(/Tudo cabe no violino \(Ré4 – Ré5\), só 1ª posição/)).toBeVisible();

  await page.getByRole('button', { name: 'Ouvir' }).click();
  await expect(page.getByRole('button', { name: 'Parar' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Parar' }).click();
  await expect(page.getByRole('button', { name: 'Ouvir' })).toBeVisible();

  await page.getByRole('button', { name: /^Salvar/ }).click();
  await expect(page.getByText(/Só você vê esta música/)).toBeVisible();
  await page.getByRole('link', { name: /Jogar agora/ }).click();
  await expect(page).toHaveURL(/\/tocar\?musica=escrita-1$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Escolha o modo');
  // Guardada no aparelho ao salvar: a seleção encontra a música mesmo sem internet
  await page.getByRole('button', { name: /Continuar com/ }).click();
  await expect(page.getByRole('radiogroup', { name: 'Músicas' }).getByRole('radio', { name: 'Minha escala de Ré' })).toBeChecked();
});

test('a Biblioteca abre o editor', async ({ page }) => {
  await page.goto('/biblioteca');
  await page.getByRole('link', { name: /Escrever música/ }).click();
  await expect(page).toHaveURL(/\/editor$/);
  await expect(staff(page)).toBeFocused();
});

test('o rascunho fica no aparelho: recarregar não perde o que foi escrito', async ({ page }) => {
  await page.goto(EDITOR);
  await staff(page).focus();
  await page.keyboard.type('dfa');
  // O aviso "rascunho salvo" some no celular deitado; o armazenamento conta nos dois
  await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('vh:rascunho-partitura') && localStorage.getItem(k)!.includes('"midi":69')))).toBe(true);
  await page.reload();
  await expect(notes(page)).toHaveCount(3);
});

test('toque na pauta escreve a nota e a paleta troca a figura', async ({ page }) => {
  await page.goto(EDITOR);
  await page.getByRole('button', { name: 'Mínima', exact: true }).click();
  const svg = page.getByRole('img', { name: /^Partitura de/ });
  const box = (await svg.boundingBox())!;
  const scale = box.width / 848;
  // Linha do meio (Si4) do primeiro compasso, logo depois da barra da fórmula de compasso
  await svg.click({ position: { x: 130 * scale, y: 68 * scale } });
  await expect(notes(page)).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Nota selecionada' })).toContainText('Si4');
  await expect(page.getByRole('region', { name: 'Nota selecionada' })).toContainText('mínima · 2 tempos');
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test(`${tema}, fonte ${fonte}: cabe, toque de 44 px, texto de 12 px`, async ({ page, isMobile }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      if (fonte === 'reserva') await blockWebFonts(page);
      await page.goto(EDITOR);
      await staff(page).focus();
      await page.keyboard.type('defgabcdefg');
      await expect(notes(page)).toHaveCount(11);
      await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
      await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
      // No celular deitado a tela rola na vertical (a pauta e o painel da nota não cabem juntos em 390 px)
      if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'rolagem horizontal').toBeLessThanOrEqual(0);
      else await expectFits(page);
      expect(await tooSmallTargets(page)).toEqual([]);
      expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
    });
  }
}

test('foco visível no teclado', async ({ page }) => {
  await page.goto(EDITOR);
  await expect(staff(page)).toBeFocused();
  // A pauta abre focada (é o último controle da tela): o contorno dela aparece e o Shift+Tab volta à paleta
  expect(await staff(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Shift+Tab');
  const back = await page.evaluate(() => ({ label: document.activeElement?.getAttribute('aria-label'), outline: getComputedStyle(document.activeElement!).outlineStyle }));
  expect(back).toEqual({ label: 'Ligadura', outline: 'solid' });
});
