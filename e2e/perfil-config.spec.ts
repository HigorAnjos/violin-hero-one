import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { expectFits, expectVisibleFocus, tinyText, tooSmallTargets } from './layout';

/** Jogador com histórico no aparelho: apelido comprido, bicho, recordes e selos, para o Perfil ter tudo preenchido. */
async function seedProgress(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('vh:profile', JSON.stringify({ level: 'some_songs', nickname: 'Maria Eduarda Pizzicato', animal: 'penguin' }));
    localStorage.setItem(
      'vh:recordes',
      JSON.stringify({ 'ode-a-alegria:easy': 1234567, 'escala-re-maior:easy': 845000, 'greensleeves:medium': 99000, 'ode-a-alegria:hard': 12000 })
    );
    localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica', 'combo-25', 'afinacao-de-ouro']));
    localStorage.setItem('vh:latency', JSON.stringify({ default: { latencySeconds: 0.142, confidence: 0.9, measuredAt: new Date().toISOString() } }));
  });
}

const SCREENS = [
  { name: 'configurações · áudio', path: '/configuracoes', ready: (p: Page) => expect(p.getByRole('region', { name: 'Som' })).toBeVisible() },
  { name: 'configurações · jogo', path: '/configuracoes?secao=jogo', ready: (p: Page) => expect(p.getByRole('region', { name: 'Na pista' })).toBeVisible() },
  { name: 'configurações · visual', path: '/configuracoes?secao=visual', ready: (p: Page) => expect(p.getByRole('radiogroup', { name: 'Temas especiais' })).toBeVisible() },
  {
    name: 'configurações · acessibilidade',
    path: '/configuracoes?secao=acessibilidade',
    ready: (p: Page) => expect(p.getByRole('switch', { name: /Padrões para daltonismo/ })).toBeVisible(),
  },
  { name: 'perfil', path: '/perfil', ready: (p: Page) => expect(p.getByRole('region', { name: 'Conquistas' })).toBeVisible() },
  { name: 'selos', path: '/selos', ready: (p: Page) => expect(p.getByRole('heading', { name: 'Seus selos' })).toBeVisible() },
  { name: 'lembrete', path: '/lembrete', ready: (p: Page) => expect(p.getByRole('heading', { name: 'Lembrete de prática' })).toBeVisible() },
];

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
  await seedProgress(page);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const screen of SCREENS) {
        test(`${screen.name} cabe na tela, com toque de 44 px e texto de 12 px`, async ({ page }) => {
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

test('da tela inicial ao Perfil e às Configurações pelos botões do canto', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Maria Eduarda Pizzicato' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Conquistas' }).getByRole('img', { name: 'Selo Primeira música' })).toBeVisible();
  await expect(page.getByText('Toque uma música inteira sem errar nenhuma nota')).toBeVisible();
  await page.getByRole('link', { name: 'Configurações' }).click();
  await expect(page).toHaveURL(/\/configuracoes$/);
  await expect(page.getByRole('region', { name: 'Latência' })).toContainText('142 ms');
});

test('8-Bits pelo seletor: fonte pixel e cantos retos na hora', async ({ page }) => {
  await page.goto('/configuracoes?secao=visual');
  await page.getByRole('radio', { name: /8-Bits/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', '8-bits');
  const heading = page.getByRole('heading', { name: 'Configurações' });
  await expect(heading).toHaveCSS('font-family', /Pixelify Sans/);
  // Sem ligadura: o "fi" da Pixelify vira um glifo que parece "A"
  await expect(heading).toHaveCSS('font-variant-ligatures', 'none');
  // Texto corrido continua na Nunito (na Pixelify pequena o 5 se lê como S)
  await expect(page.getByText(/Mudam mais que a cor/)).toHaveCSS('font-family', /^Nunito/);
  await expect(page.getByRole('region', { name: 'Visual' })).toHaveCSS('border-radius', '0px');
});

test('reduzir movimento: nenhuma transição longa nas telas novas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await screen.ready(page);
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll('main *')]
        .map((el) => getComputedStyle(el))
        .filter((s) => s.animationName !== 'none' && parseFloat(s.animationDuration) > 0)
        .map((s) => s.animationName)
    );
    expect(moving, screen.name).toEqual([]);
  }
});
