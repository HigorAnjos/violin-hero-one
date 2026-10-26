import { expect, type Page } from '@playwright/test';

/** Famílias do tema: o 8-Bits usa a Pixelify Sans no título e no texto; os outros, Baloo 2 e Nunito. */
const familiesOf = (theme?: string): [string, string] => (theme === '8-bits' ? ['Pixelify Sans', 'Pixelify Sans'] : ['Baloo 2', 'Nunito']);

/**
 * Espera as fontes do tema (servidas pelo app) antes de medir o layout: com a fonte reserva as linhas mudam de
 * altura e a medida não vale para a tela de verdade. Falha alto se a fonte não carregou, em vez de medir com a reserva.
 */
export async function fontsReady(page: Page, theme?: string) {
  const [display, ui] = familiesOf(theme);
  const loaded = await page.evaluate(
    async ([d, u]) => {
      await document.fonts.ready;
      await Promise.all([document.fonts.load(`800 16px "${d}"`), document.fonts.load(`400 16px "${u}"`)]);
      return { display: document.fonts.check(`800 16px "${d}"`), ui: document.fonts.check(`400 16px "${u}"`) };
    },
    [display, ui]
  );
  expect(loaded, 'fontes do tema carregadas antes de medir').toEqual({ display: true, ui: true });
}

/** Corta os woff2 do app (chamar antes de abrir a página): a tela fica com a fonte reserva, como sem rede no primeiro acesso. */
export async function blockWebFonts(page: Page) {
  await page.route(/\.woff2(\?.*)?$/, (route) => route.abort());
}

/**
 * Com os woff2 cortados, confere que a tela está mesmo na reserva medida (as faces Fallback sobre Arial/Liberation
 * Sans) e não no system-ui: sem a fonte local a medida não testaria nada.
 */
export async function fallbackFontsReady(page: Page, theme?: string) {
  const [display, ui] = familiesOf(theme);
  const state = await page.evaluate(
    async ([d, u]) => {
      await document.fonts.ready;
      await Promise.allSettled([document.fonts.load(`800 16px "${d}"`), document.fonts.load(`400 16px "${u}"`)]);
      await Promise.all([document.fonts.load(`800 16px "${d} Fallback"`), document.fonts.load(`400 16px "${u} Fallback"`)]);
      const anyLoaded = (family: string) => [...document.fonts].some((f) => f.family.replace(/"/g, '') === family && f.status === 'loaded');
      return { real: [anyLoaded(d), anyLoaded(u)], fallback: [anyLoaded(`${d} Fallback`), anyLoaded(`${u} Fallback`)] };
    },
    [display, ui]
  );
  expect(state.real, 'woff2 do app cortados').toEqual([false, false]);
  expect(state.fallback, 'reserva medida disponível (Arial ou Liberation Sans)').toEqual([true, true]);
}
