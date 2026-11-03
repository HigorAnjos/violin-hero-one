import { expect, test } from '@playwright/test';
import { fontsReady } from '../fonts';
import { expectFits, tinyText, tooSmallTargets } from '../layout';
import { CATALOG } from './catalogo';

/**
 * O grupo Exercícios técnicos da Biblioteca contra o Supabase local (a categoria vem do seed), nos três temas, no
 * desktop e no celular: o filtro separa os 9 exercícios das músicas e a tela continua cabendo.
 */
const EXERCISES = CATALOG.filter((s) => s.sheet.category === 'exercicio');
const MUSICS = CATALOG.filter((s) => s.sheet.category === 'musica');

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  test(`${tema}: Exercícios técnicos separa os exercícios das músicas e cabe na tela`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
    await page.goto('/biblioteca');
    const cards = page.getByRole('list', { name: 'Músicas' }).getByRole('link');
    // A primeira consulta ao PostgREST recém-subido monta o cache do schema: leva alguns segundos
    await expect(cards).toHaveCount(CATALOG.length, { timeout: 15000 });
    await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
    await expect(page.getByText(`${MUSICS.length} músicas · ${EXERCISES.length} exercícios`, { exact: false })).toBeVisible();

    const group = page.getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Exercícios técnicos' });
    await group.click();
    await expect(group).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(EXERCISES.length);
    expect(await cards.evaluateAll((els) => els.map((el) => el.querySelector('b')?.textContent))).toEqual(EXERCISES.map((s) => s.sheet.title));
    await fontsReady(page, tema);
    await expectFits(page);
    expect(await tooSmallTargets(page), 'alvos de toque abaixo de 44 px').toEqual([]);
    expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);

    await page.getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Músicas' }).click();
    await expect(cards).toHaveCount(MUSICS.length);
    await expectFits(page);

    // o último filtro também se alcança (no celular deitado os filtros rolam de lado)
    const app = page.getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'No app' });
    await app.click();
    await expect(app).toHaveAttribute('aria-pressed', 'true');
    await expect(app).toBeInViewport();
    await expectFits(page);

    // exercício abre como música: modo, seleção e níveis
    await group.click();
    await cards.first().click();
    await expect(page).toHaveURL(new RegExp(`/tocar\\?musica=${EXERCISES[0].sheet.id}$`));
  });
}
