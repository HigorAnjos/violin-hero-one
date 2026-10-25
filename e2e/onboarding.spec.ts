import { expect, test, type Page } from '@playwright/test';

// O Chromium do teste nega o microfone: todo problema vira "bloqueado"; os outros estados usam o
// mesmo cartão e ficam com os testes unitários
const SCREENS = [
  { name: 'nível', path: '/primeira-vez/nivel', heading: 'Quanto você já toca?' },
  { name: 'microfone', path: '/primeira-vez/microfone', heading: 'Precisamos ouvir seu violino' },
  { name: 'bloqueado', path: '/microfone/problema?motivo=sem-permissao', heading: 'O microfone foi bloqueado' },
  { name: 'contagem', path: '/contagem', heading: null },
];

async function tooSmallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a[href], input, [role="radio"]')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.height < 43.5 || box.width < 43.5)
      .map(({ el, box }) => `${el.textContent?.trim() || el.getAttribute('aria-label')}: ${Math.round(box.width)}×${Math.round(box.height)}`)
  );
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(screen.path);
      if (screen.heading) await expect(page.getByRole('heading', { level: 1 })).toHaveText(screen.heading);
    });

    test('não rola na horizontal', async ({ page }) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('toque de pelo menos 44 px', async ({ page }) => {
      expect(await tooSmallTargets(page)).toEqual([]);
    });

    test('foco visível no teclado', async ({ page }) => {
      // Shift+Tab: o aviso de microfone já abre com o foco no último botão
      await page.keyboard.press('Shift+Tab');
      const outline = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return el && el !== document.body ? getComputedStyle(el).outlineStyle : 'sem foco';
      });
      expect(outline).toBe('solid');
    });
  });
}

test('cordas soltas com o microfone negado levam ao microfone bloqueado', async ({ page }) => {
  await page.goto('/primeira-vez/cordas');
  await expect(page.getByRole('alertdialog', { name: 'O microfone foi bloqueado' })).toBeVisible();
});

test('reduzir movimento desliga a pulsação da contagem', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contagem');
  const animation = await page.getByRole('timer').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
});
