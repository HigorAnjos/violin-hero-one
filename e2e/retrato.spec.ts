import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectFitsWidth, expectVisibleFocus, overlappingTargets, tinyText, tooSmallTargets } from './layout';

/**
 * Celular em pé (390×844, o menor dos comuns; 412×915 numa passada só). As telas que não tocam viram uma coluna que
 * rola; as que tocam (afinar, jogo, contagem…) dão lugar ao aviso de girar, sem abrir o microfone. O microfone falso
 * do Chromium conta os getUserMedia. Roda só no projeto desktop: o tamanho é o desta spec, não o do projeto.
 */
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  permissions: ['microphone'],
  launchOptions: launchWith('--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'),
});

const CODE = 'ADGK-NRUX';
const h1 = (name: string | RegExp) => (p: Page) => expect(p.getByRole('heading', { level: 1, name })).toBeVisible();

const SCREENS = [
  { name: 'login', path: '/entrar', ready: (p: Page) => expect(p.getByRole('heading', { name: 'Como você quer começar?' })).toBeVisible() },
  { name: 'inicial', path: '/', ready: (p: Page) => expect(p.getByRole('navigation', { name: 'Menu principal' })).toBeVisible() },
  { name: 'biblioteca', path: '/biblioteca', ready: (p: Page) => expect(p.getByRole('list', { name: 'Músicas' }).getByRole('link')).toHaveCount(3) },
  ...['audio', 'jogo', 'visual', 'acessibilidade', 'conta', 'lembrete'].map((secao) => ({
    name: `configurações · ${secao}`,
    path: secao === 'audio' ? '/configuracoes' : `/configuracoes?secao=${secao}`,
    ready: h1('Configurações'),
  })),
  { name: 'privacidade', path: '/privacidade', ready: h1('Política de privacidade') },
  { name: 'conta', path: '/conta?motivo=ranking&depois=%2F&voltar=%2Fperfil', ready: (p: Page) => expect(p.getByRole('dialog')).toBeVisible() },
  { name: 'turma', path: `/turma?codigo=${CODE}&turmas=simulada`, ready: h1('Entrar na turma do seu professor') },
  { name: 'aluno · entrar', path: `/turma/entrar?codigo=${CODE}&turmas=simulada`, ready: h1('1. Quem é você?') },
  { name: 'professor', path: '/professor?turmas=simulada', ready: (p: Page) => expect(p.getByRole('heading', { name: 'Crie sua primeira turma' })).toBeVisible() },
  { name: 'responsável', path: '/responsavel?turmas=simulada', ready: (p: Page) => expect(p.locator('main h1')).toBeVisible() },
  { name: 'planos', path: '/planos?turmas=simulada', ready: (p: Page) => expect(p.locator('main h1')).toBeVisible() },
  { name: 'perfil', path: '/perfil', ready: (p: Page) => expect(p.getByRole('region', { name: 'Conquistas' }).or(p.locator('main h1')).first()).toBeVisible() },
  { name: 'selos', path: '/selos', ready: h1('Seus selos') },
  { name: 'ranking', path: '/ranking', ready: h1('Ranking') },
  { name: 'desafio', path: '/desafio', ready: h1('Desafiar um amigo') },
  { name: 'modos', path: '/tocar', ready: h1('Escolha o modo') },
  { name: 'músicas', path: '/tocar/musica?modo=arcade', ready: (p: Page) => expect(p.getByRole('radiogroup', { name: 'Músicas' })).toBeVisible() },
];

/** Cabe na largura, sem sobrepor, toque de 44 px e texto de 12 px. */
async function checkScreen(page: Page, what: string) {
  await expectFitsWidth(page);
  expect(await tooSmallTargets(page), `${what}: toque abaixo de 44 px`).toEqual([]);
  expect(await overlappingTargets(page), `${what}: controles sobrepostos`).toEqual([]);
  expect(await tinyText(page), `${what}: texto abaixo de 12 px`).toEqual([]);
}

async function enterClass(page: Page) {
  await page.goto(`/turma/entrar?codigo=${CODE}&turmas=simulada`);
  await page.getByLabel('Seu nome, como o professor cadastrou').fill('Ana Clara');
  for (const digit of '1000') await page.getByRole('group', { name: 'Teclado do PIN' }).getByRole('button', { name: digit, exact: true }).click();
  await page.getByRole('button', { name: /^Entrar/ }).click();
  await expect(page).toHaveURL(/\/tarefas$/);
}

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'o tamanho é desta spec: uma passada basta');
  await skipOnboarding(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Conta cada pedido de microfone
  await page.addInitScript(() => {
    const w = window as Window & { __gum?: number };
    w.__gum = 0;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (constraints) => {
      w.__gum = (w.__gum ?? 0) + 1;
      return original(constraints);
    };
  });
});

const micRequests = (page: Page) => page.evaluate(() => (window as Window & { __gum?: number }).__gum ?? -1);

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      const ready = (page: Page) => (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));

      test.beforeEach(async ({ page }) => {
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const screen of SCREENS) {
        test(`${screen.name}: uma coluna, nada cortado nem sobreposto, 44 px e 12 px`, async ({ page }) => {
          await page.goto(screen.path);
          await screen.ready(page);
          await ready(page);
          await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
          await checkScreen(page, screen.name);
        });
      }

      test('aluno: tarefas e a tarefa aberta', async ({ page }) => {
        await enterClass(page);
        await ready(page);
        await checkScreen(page, 'tarefas');
        await page.getByRole('navigation', { name: 'Tarefas' }).getByRole('button', { name: /Escala de Ré maior/ }).click();
        await expect(page.getByRole('link', { name: /Tocar a tarefa/ })).toBeVisible();
        await checkScreen(page, 'tarefa aberta');
      });

      test('professor: turma, PIN, nova tarefa, entregas e revisão', async ({ page }) => {
        await page.goto('/professor?turmas=simulada');
        await ready(page);
        await page.getByLabel('Nome da turma').fill('Iniciantes · sábado');
        await page.getByRole('button', { name: 'Criar turma' }).click();
        await expect(page.getByRole('heading', { name: 'Iniciantes · sábado' })).toBeVisible();
        for (const name of ['Ana Clara Albuquerque', 'Bruno']) {
          await page.getByRole('textbox', { name: 'Nome do aluno' }).fill(name);
          await page.getByRole('button', { name: 'Cadastrar' }).click();
          const pin = page.getByRole('alertdialog', { name: `PIN de ${name}` });
          await expect(pin).toBeVisible();
          if (name === 'Bruno') await checkScreen(page, 'PIN do aluno');
          await pin.getByRole('button', { name: 'Anotei o PIN' }).click();
        }
        await expect(page.getByRole('button', { name: 'Redefinir PIN de Bruno' })).toBeVisible();
        await checkScreen(page, 'painel da turma');

        await page.getByRole('link', { name: /Nova tarefa/ }).click();
        await expect(page.getByRole('heading', { name: 'Nova tarefa' })).toBeVisible();
        await checkScreen(page, 'nova tarefa');
        await page.getByRole('button', { name: /Enviar para 2 alunos/ }).click();

        const inbox = page.getByRole('region', { name: 'Para revisar' });
        await expect(inbox.getByRole('link')).toHaveCount(2);
        await checkScreen(page, 'painel com entregas');
        await inbox.getByRole('link').first().click();
        await expect(page.getByRole('button', { name: /Enviar revisão/ })).toBeVisible();
        await checkScreen(page, 'revisão');
      });
    });
  }
}

test('412×915 (Pixel 7 e 9): as mesmas telas cabem', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 412, height: 915 });
  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await screen.ready(page);
    await fontsReady(page);
    await checkScreen(page, screen.name);
  }
});

for (const screen of SCREENS.filter((s) => ['login', 'inicial', 'biblioteca', 'configurações · audio', 'turma', 'responsável'].includes(s.name))) {
  test(`${screen.name}: foco visível no teclado em pé`, async ({ page }) => {
    await page.goto(screen.path);
    await screen.ready(page);
    await expectVisibleFocus(page);
  });
}

test('inicial: estado e atalhos acima do título, o menu inteiro antes da arte', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Menu principal' })).toBeVisible();
  const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  const settings = (await page.getByRole('link', { name: 'Configurações' }).boundingBox())!;
  const menu = (await page.getByRole('navigation', { name: 'Menu principal' }).boundingBox())!;
  const art = (await page.getByTestId('violin-art').boundingBox())!;
  expect(settings.y + settings.height, 'atalhos acima do título').toBeLessThanOrEqual(title.y);
  expect(art.y, 'arte depois do menu').toBeGreaterThanOrEqual(menu.y + menu.height);
});

test('biblioteca: duas colunas e os filtros inteiros', async ({ page }) => {
  await page.goto('/biblioteca');
  const cards = page.getByRole('list', { name: 'Músicas' }).getByRole('link');
  await expect(cards).toHaveCount(3);
  const [a, b] = [(await cards.nth(0).boundingBox())!, (await cards.nth(1).boundingBox())!];
  expect(Math.abs(a.y - b.y), 'dois cartões na mesma linha').toBeLessThan(1);
  for (const filter of await page.getByRole('group', { name: 'Filtro' }).getByRole('button').all()) {
    expect(await filter.evaluate((el) => el.scrollWidth - el.clientWidth), `filtro "${await filter.textContent()}" cortado`).toBeLessThanOrEqual(0);
    await expect(filter).toBeInViewport({ ratio: 1 });
  }
});

const PLAYING = [
  { name: 'afinar', path: '/afinar?musica=escala-re-maior', ready: (p: Page) => expect(p.getByRole('region', { name: 'Afinador' })).toBeVisible() },
  {
    name: 'jogo',
    path: '/jogo?musica=escala-re-maior',
    ready: async (p: Page) => {
      await expect(p.getByTestId('pista').locator('canvas')).toBeAttached();
      await expect(p.getByRole('button', { name: 'Pausar' })).toBeEnabled({ timeout: 10000 });
    },
  },
];

for (const screen of PLAYING) {
  for (const tema of ['caderno', 'palco', '8-bits'] as const) {
    test(`${screen.name} em pé (${tema}): aviso de girar, sem microfone; deitado, segue normal`, async ({ page }) => {
      await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
      await page.goto(screen.path);
      await expect(page.getByRole('heading', { name: 'Gire o celular para tocar' })).toBeVisible();
      await fontsReady(page, tema);
      await checkScreen(page, `aviso de girar em ${screen.name}`);
      await expect(page.getByTestId('pista')).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Afinador' })).toHaveCount(0);
      // Dá tempo de um pedido de microfone ou contagem que escapasse
      await page.waitForTimeout(1500);
      expect(await micRequests(page), 'microfone pedido em pé').toBe(0);
      await expect(page.getByRole('link', { name: /Menu/ })).toHaveAttribute('href', '/');

      await page.setViewportSize({ width: 844, height: 390 });
      await screen.ready(page);
      await expect(page.getByRole('heading', { name: 'Gire o celular para tocar' })).toHaveCount(0);
      await expect.poll(() => micRequests(page), { message: 'deitado, o microfone abre' }).toBeGreaterThan(0);
    });
  }
}

test('editor em pé pede para girar; a contagem também', async ({ page }) => {
  await page.goto('/editor');
  await expect(page.getByRole('heading', { name: 'Gire o celular para escrever' })).toBeVisible();
  await page.goto('/contagem');
  await expect(page.getByRole('heading', { name: 'Gire o celular para tocar' })).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await micRequests(page)).toBe(0);
});
