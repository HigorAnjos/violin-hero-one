import { expect, type Page } from '@playwright/test';

/**
 * Espera as fontes do tema antes de medir o layout: com a fonte reserva (system-ui) as linhas mudam de
 * altura e a medida não vale para a tela de verdade. Falha alto se a fonte não carregou, em vez de medir com a reserva.
 */
export async function fontsReady(page: Page) {
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([document.fonts.load('800 16px "Baloo 2"'), document.fonts.load('400 16px "Nunito"')]);
    return { baloo: document.fonts.check('800 16px "Baloo 2"'), nunito: document.fonts.check('400 16px "Nunito"') };
  });
  expect(loaded, 'fontes do tema carregadas antes de medir').toEqual({ baloo: true, nunito: true });
}
