import type { Page } from '@playwright/test';
import { expect, test } from './microphone';
import { fontsReady } from './fonts';

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
      await fontsReady(page);
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
  // Nega de propósito: sem isso, numa máquina sem placa de som (o runner da CI) o navegador
  // responde "sem dispositivo" antes de perguntar, e o teste dependeria do hardware
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('negado no teste', 'NotAllowedError'));
  });
  await page.goto('/primeira-vez/cordas');
  await expect(page.getByRole('alertdialog', { name: 'O microfone foi bloqueado' })).toBeVisible();
});

test('reduzir movimento desliga a pulsação da contagem', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/contagem');
  const animation = await page.getByRole('timer').evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('none');
});


async function completeOnboarding(page: Page) {
  await page.goto('/primeira-vez/nivel');
  await page.getByRole('button', { name: /Continuar/ }).click();
  await page.getByRole('button', { name: /Permitir microfone/ }).click();
  await expect(page).toHaveURL(/\/primeira-vez\/cordas$/);
  await expect(page.getByRole('status').filter({ hasText: /de 4 cordas/ })).toHaveText('4 de 4 cordas · tudo certo!', { timeout: 30000 });
  await page.getByRole('button', { name: /Continuar/ }).click();
  await expect(page).toHaveURL(/\/contagem$/);
}

test('celular: primeiro jogo após onboarding desenha Cordas 3D e avança', async ({ micPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'celular', 'fluxo no celular 844×390');
  test.setTimeout(60000);
  const page = await micPage('cordas-soltas');
  await completeOnboarding(page);
  await expect(page).toHaveURL(/\/jogo\/3d$/, { timeout: 15000 });
  const canvas = page.getByTestId('cordas-3d').locator('canvas');
  await expect(canvas).toBeVisible();
  expect((await canvas.boundingBox())?.width).toBeGreaterThan(300);
  expect((await canvas.screenshot()).byteLength).toBeGreaterThan(5000);
  await expect(page.locator('[data-judgment]').first()).toBeVisible({ timeout: 15000 });
});

test('WebGL indisponível oferece Arcade após onboarding', async ({ micPage }) => {
  test.setTimeout(60000);
  const page = await micPage('cordas-soltas');
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if (type === 'webgl' || type === 'webgl2') return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await completeOnboarding(page);
  await expect(page.getByRole('alert')).toHaveText(/Não deu para desenhar as Cordas 3D neste aparelho./, { timeout: 15000 });
  expect(await tooSmallTargets(page)).toEqual([]);
  await page.getByRole('button', { name: 'Tocar no Arcade' }).click();
  await expect(page).toHaveURL(/\/contagem$/);
  await expect(page).toHaveURL(/\/jogo$/, { timeout: 15000 });
});
