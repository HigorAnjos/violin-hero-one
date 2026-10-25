import { expect, type Page } from '@playwright/test';

/**
 * Espera as fontes do tema (servidas pelo app) antes de medir o layout: com a fonte reserva as linhas mudam de
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

/** Corta os woff2 do app (chamar antes de abrir a página): a tela fica com a fonte reserva, como sem rede no primeiro acesso. */
export async function blockWebFonts(page: Page) {
  await page.route(/\.woff2(\?.*)?$/, (route) => route.abort());
}

/**
 * Com os woff2 cortados, confere que a tela está mesmo na reserva medida (Baloo 2 Fallback e Nunito Fallback sobre
 * Arial/Liberation Sans) e não no system-ui: sem a fonte local a medida não testaria nada.
 */
export async function fallbackFontsReady(page: Page) {
  const state = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled([document.fonts.load('800 16px "Baloo 2"'), document.fonts.load('400 16px "Nunito"')]);
    await Promise.all([document.fonts.load('800 16px "Baloo 2 Fallback"'), document.fonts.load('400 16px "Nunito Fallback"')]);
    const anyLoaded = (family: string) => [...document.fonts].some((f) => f.family.replace(/"/g, '') === family && f.status === 'loaded');
    return { real: [anyLoaded('Baloo 2'), anyLoaded('Nunito')], fallback: [anyLoaded('Baloo 2 Fallback'), anyLoaded('Nunito Fallback')] };
  });
  expect(state.real, 'woff2 do app cortados').toEqual([false, false]);
  expect(state.fallback, 'reserva medida disponível (Arial ou Liberation Sans)').toEqual([true, true]);
}
