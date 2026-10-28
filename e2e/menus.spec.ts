import { expect, test, type Page } from '@playwright/test';
import { chooseSong, skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';

// Sem SUPABASE_* no build do e2e: a estante são as 3 músicas do app e as telas mostram o aviso de sem internet
const SCREENS = [
  { name: 'inicial', path: '/', ready: (p: Page) => expect(p.getByRole('navigation', { name: 'Menu principal' })).toBeVisible() },
  { name: 'modo', path: '/tocar', ready: (p: Page) => expect(p.getByRole('heading', { level: 1 })).toHaveText('Escolha o modo') },
  {
    name: 'música',
    path: '/tocar/musica?modo=arcade',
    ready: (p: Page) => expect(p.getByRole('complementary', { name: 'Detalhes da música' }).getByText(/\d+ notas/)).toBeVisible(),
  },
  { name: 'biblioteca', path: '/biblioteca', ready: (p: Page) => expect(p.getByRole('list', { name: 'Músicas' }).getByRole('link')).toHaveCount(3) },
  {
    name: 'carregando sem internet',
    path: '/tocar/carregando?modo=arcade&musica=greensleeves&nivel=medio',
    ready: (p: Page) => expect(p.getByRole('alert')).toContainText('Sem conexão'),
  },
];

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

test('os retornos nomeiam e abrem o Menu ou a tela mãe', async ({ page }) => {
  for (const path of ['/biblioteca', '/ranking', '/perfil', '/configuracoes', '/tocar']) {
    await page.goto(path);
    const back = page.getByRole('link', { name: 'Menu', exact: true });
    await expect(back).toHaveText('◂Menu');
    await expect(back).toHaveAttribute('href', '/');
    if (path === '/perfil') await expect(page.getByRole('navigation', { name: 'Perfil' }).getByRole('link').last()).toHaveAttribute('data-back', '');
    await back.click();
    await expect(page).toHaveURL(/\/$/);
  }
  await page.goto('/selos');
  await expect(page.getByRole('navigation', { name: 'Selos' }).getByRole('link').last()).toHaveAttribute('data-back', '');
  await page.getByRole('link', { name: 'Perfil', exact: true }).click();
  await expect(page).toHaveURL(/\/perfil$/);
  await page.goto('/tocar/musica?modo=partitura');
  await page.getByRole('link', { name: 'Modos', exact: true }).click();
  await expect(page).toHaveURL(/\/tocar\?modo=partitura/);
});

for (const theme of ['caderno', 'palco', '8-bits']) {
  test(`${theme}: retornos têm o mesmo topo e recuo da direita`, async ({ page }) => {
    await page.addInitScript((id) => localStorage.setItem('vh:theme', id), theme);
    const compact = page.viewportSize()!.height < 500;
    for (const path of ['/configuracoes', '/configuracoes?secao=jogo', '/configuracoes?secao=lembrete', '/tocar', '/tocar/musica', '/biblioteca', '/perfil', '/selos', '/ranking', '/lembrete']) {
      await page.goto(path);
      const back = page.locator('[data-back]');
      await expect(back).toBeVisible();
      await fontsReady(page, theme);
      const bounds = await back.boundingBox();
      expect({ top: Math.round(bounds!.y), right: Math.round(page.viewportSize()!.width - bounds!.x - bounds!.width) }, path).toEqual(compact ? { top: 12, right: 16 } : { top: 32, right: 48 });
      await expectFits(page);
    }
  });
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const screen of SCREENS) {
        test(`${screen.name} cabe na tela, com toque de 44 px`, async ({ page }) => {
          await page.goto(screen.path);
          await screen.ready(page);
          await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
          await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
          await expectFits(page);
          expect(await tooSmallTargets(page)).toEqual([]);
          expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
        });
      }
    });
  }
}

for (const screen of SCREENS) {
  test(`${screen.name}: foco visível no teclado`, async ({ page }) => {
    await page.goto(screen.path);
    await screen.ready(page);
    await expectVisibleFocus(page);
  });
}

test('sem banco: a estante são as 3 do app, com o aviso', async ({ page }) => {
  await page.goto('/tocar/musica?modo=arcade');
  await expect(page.getByRole('status').filter({ hasText: 'Sem internet' })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Músicas' }).getByRole('radio')).toHaveCount(3);
});

test('Cordas 3D entra na escolha pelas setas e leva à música com o modo', async ({ page }) => {
  await page.goto('/tocar');
  await page.getByRole('radio', { name: 'Arcade' }).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: 'Cordas 3D' })).toBeFocused();
  await expect(page.getByRole('radio', { name: 'Cordas 3D' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/tocar\/musica\?modo=cordas-3d$/);
});

test('a biblioteca pede o modo e abre a seleção com a música escolhida', async ({ page }) => {
  await page.goto('/biblioteca');
  await page.getByRole('list', { name: 'Músicas' }).getByRole('link', { name: /Ode/ }).click();
  await expect(page).toHaveURL(/\/tocar\?musica=ode-a-alegria$/);
  await page.getByRole('radio', { name: /Cordas 3D/ }).click();
  await page.getByRole('button', { name: /Continuar com Cordas 3D/ }).click();
  await expect(page).toHaveURL(/\/tocar\/musica\?modo=cordas-3d&musica=ode-a-alegria$/);
  await expect(page.getByRole('radio', { name: /Ode/ })).toHaveAttribute('aria-checked', 'true');
});

test('da tela inicial à partida em Partitura', async ({ page }) => {
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, /Escala/, 'Partitura');
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/jogo\/partitura$/);
  await expect(page.getByTestId('partitura')).toBeAttached();
});

test('Praticar trecho chega à prática', async ({ page }) => {
  await page.goto('/tocar/musica?modo=arcade&musica=escala-re-maior&ouvido=simulado');
  await page.getByRole('complementary', { name: 'Detalhes da música' }).getByRole('link', { name: 'Praticar trecho' }).click();
  await expect(page).toHaveURL(/\/afinar$/);
  await page.getByRole('button', { name: /Começar/ }).click();
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/pratica$/);
});

test('da tela inicial à partida em Arcade', async ({ page }) => {
  await page.goto('/?ouvido=simulado');
  await chooseSong(page, /Ode/);
  // No celular a Calibration esconde esse rótulo; basta estar na tela com a música e o nível certos
  await expect(page.getByText(/Antes de tocar · .*Ode.* · Fácil/)).toBeAttached();
  await page.getByRole('button', { name: /Começar/ }).click();
  await expect(page).toHaveURL(/\/contagem$/);
  await page.getByRole('button', { name: /Pular contagem/ }).click();
  await expect(page).toHaveURL(/\/jogo$/);
  await expect(page.getByTestId('pista')).toBeAttached();
});
