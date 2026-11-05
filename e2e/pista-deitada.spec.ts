import { expect, test, type Locator, type Page } from '@playwright/test';
import { projectX, projectY, stageBox, strings3dBox, trackLayout, type Box } from '../src/game/render/layout';
import { COMPACT_FRAMING, FLOOR_LENGTH, MIN_COLUMNS, project, STRING_HEIGHTS, strings3dLayout } from '../src/game/render/strings3dLayout';
import { skipOnboarding } from './choose';
import { blockWebFonts, fallbackFontsReady, fontsReady } from './fonts';
import { launchWith } from './launch';
import { expectFits, overlappingTargets, tinyText, tooSmallTargets } from './layout';

// A partida começa sozinha (contagem e áudio sem gesto do jogador)
test.use({ launchOptions: launchWith('--autoplay-policy=no-user-gesture-required') });

/**
 * Celular deitado: a pista é a protagonista. Sem a pauta embaixo (só o fio do andamento), a pista vai do topo ao pé
 * da tela; os cartões ficam nos cantos sem cobrir onde as notas passam, mesmo com o motivo do erro aberto no cartão de
 * afinação (?erros, a dica mais alta do cartão).
 */
const VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 932, height: 430 },
];
/** A caixa da pista ocupa pelo menos isto da tela (antes: 36%). */
const MIN_AREA = 0.7;
const SONG = 'musica=brilha-brilha-estrelinha&simular=0&erros=12';

const MODES = [
  { name: 'Arcade', path: `/jogo?ouvido=simulado&${SONG}`, testId: 'pista' },
  { name: 'Cordas 3D', path: `/jogo/3d?ouvido=simulado&${SONG}`, testId: 'cordas-3d' },
] as const;

const rect = async (locator: Locator) => (await locator.boundingBox())!;
const overlaps = (a: Box, b: Box) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5;

/** x na tela da borda esquerda (side −1) ou direita (+1) do chão das Cordas 3D na altura `y` da tela. */
function floorEdge3d(box: Box, side: -1 | 1, y: number) {
  const l = strings3dLayout(box.width, box.height, MIN_COLUMNS, 2, COMPACT_FRAMING);
  const edge = side < 0 ? l.left : l.right;
  let z = -FLOOR_LENGTH;
  while (z < 0 && box.y + project(l, edge, 0, z).y < y) z += 0.05;
  return box.x + project(l, edge, 0, z).x;
}

/** O mesmo para o plano da pista Arcade. */
function planeEdge(box: Box, side: -1 | 1, y: number) {
  const l = trackLayout(box.width, box.height);
  let d = l.farDepth;
  while (d > 0 && box.y + projectY(l, d) < y) d -= 1;
  return box.x + projectX(l, (side * l.planeWidth) / 2, d);
}

async function open(page: Page, path: string, testId: string) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await expect(page.getByTestId(testId).locator('canvas')).toBeAttached();
  await expect(page.getByRole('button', { name: 'Pausar' })).toBeEnabled({ timeout: 10000 });
}

test.beforeEach(async ({ page }) => {
  await skipOnboarding(page);
});

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'celular', 'layout do celular deitado');
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const mode of MODES) {
        test(`${mode.name}: a pista ocupa a tela e os cartões não cobrem as notas, em 844×390 e 932×430`, async ({ page }) => {
          test.setTimeout(90000);
          for (const viewport of VIEWPORTS) {
            await page.setViewportSize(viewport);
            await open(page, mode.path, mode.testId);
            await (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
            // O cartão de afinação na altura máxima: com o motivo do erro aberto
            const tuningLocator = page.getByRole('region', { name: 'Afinação' });
            await expect(tuningLocator.getByRole('status')).toBeVisible({ timeout: 30000 });

            const box = await rect(page.getByTestId(mode.testId));
            const where = `${mode.name} ${viewport.width}×${viewport.height}`;
            expect((box.width * box.height) / (viewport.width * viewport.height), `área da pista em ${where}`).toBeGreaterThanOrEqual(MIN_AREA);
            expect(box.y + box.height, `a pista desce até o pé em ${where}`).toBeGreaterThanOrEqual(viewport.height - 1);
            // Sem a pauta: só o fio do andamento
            await expect(page.getByRole('region', { name: 'Partitura' })).toHaveCount(0);
            await expect(page.getByRole('progressbar', { name: 'Andamento da música' })).toBeVisible();

            const score = await rect(page.getByRole('region', { name: 'Placar' }));
            const tuning = await rect(tuningLocator);
            const pause = await rect(page.getByRole('button', { name: 'Pausar' }));
            expect(pause.width, 'pausar com 44 px').toBeGreaterThanOrEqual(43.5);
            expect(pause.height, 'pausar com 44 px').toBeGreaterThanOrEqual(43.5);
            const hud = { placar: score, afinação: tuning, pausar: pause };
            const callout = page.locator('[data-judgment]');
            if (mode.name === 'Cordas 3D' && (await callout.count())) Object.assign(hud, { julgamento: await rect(callout.locator('..')) });
            const names = Object.keys(hud) as (keyof typeof hud)[];
            for (const [i, a] of names.entries()) for (const b of names.slice(i + 1)) expect(overlaps(hud[a], hud[b]), `${a} × ${b} em ${where}`).toBe(false);

            const bottom = (r: Box) => r.y + r.height;
            if (mode.name === 'Arcade') {
              expect(score.x + score.width, `placar fora do plano em ${where}`).toBeLessThanOrEqual(planeEdge(box, -1, bottom(score)));
              expect(tuning.x, `afinação fora do plano em ${where}`).toBeGreaterThanOrEqual(planeEdge(box, 1, bottom(tuning)));
            } else {
              // A afinação fica na coluna dela, fora do canvas; o placar e o julgamento, à esquerda do chão e acima das cordas
              expect(tuning.x, `afinação fora das cordas em ${where}`).toBeGreaterThanOrEqual(box.x + box.width);
              expect(score.x + score.width, `placar fora do chão em ${where}`).toBeLessThanOrEqual(floorEdge3d(box, -1, bottom(score)));
              const l = strings3dLayout(box.width, box.height, MIN_COLUMNS, 2, COMPACT_FRAMING);
              const stringG = box.y + project(l, 0, STRING_HEIGHTS[0], 0).y;
              if ('julgamento' in hud) {
                const j = hud.julgamento as Box;
                expect(bottom(j), `julgamento acima das cordas em ${where}`).toBeLessThan(stringG - 12);
                expect(j.x + j.width, `julgamento fora do chão em ${where}`).toBeLessThanOrEqual(floorEdge3d(box, -1, bottom(j)));
              }
            }

            await expectFits(page);
            expect(await tooSmallTargets(page), 'toque abaixo de 44 px').toEqual([]);
            expect(await overlappingTargets(page), 'controles sobrepostos').toEqual([]);
            expect(await tinyText(page), 'texto abaixo de 12 px').toEqual([]);
          }
        });
      }
    });
  }
}

/**
 * Botão Pauta (Arcade e Cordas 3D) e Painel (Partitura) no celular deitado: alterna, diz o estado (aria-pressed), nada
 * corta nem cobre nos dois estados, vale na partida seguinte e na Pausa (nos Ajustes rápidos).
 */
const LONG_SONG = 'musica=ode-a-alegria&simular=0&erros=12';
const TOGGLE_MODES = [
  { name: 'Arcade', path: `/jogo?ouvido=simulado&${LONG_SONG}`, testId: 'pista', thing: 'pauta', startsOn: false },
  { name: 'Cordas 3D', path: `/jogo/3d?ouvido=simulado&${LONG_SONG}`, testId: 'cordas-3d', thing: 'pauta', startsOn: false },
  { name: 'Partitura', path: `/jogo/partitura?ouvido=simulado&${LONG_SONG}`, testId: 'partitura', thing: 'painel', startsOn: true },
] as const;

type ToggleMode = (typeof TOGGLE_MODES)[number];

const toggleOf = (page: Page, mode: ToggleMode) => page.getByRole('button', { name: new RegExp(`^(Mostrar|Esconder) ${mode.thing}$`) });

/** O botão no estado `on`, e a tela como ela deve ficar nele; devolve a caixa da pista (ou da pauta, na Partitura). */
async function expectToggleState(page: Page, mode: ToggleMode, on: boolean, where: string) {
  const toggle = toggleOf(page, mode);
  await expect(toggle, `aria-pressed em ${where}`).toHaveAttribute('aria-pressed', String(on));
  await expect(toggle).toHaveAccessibleName(`${on ? 'Esconder' : 'Mostrar'} ${mode.thing}`);
  await expect(toggle).toContainText(mode.thing === 'pauta' ? 'Pauta' : 'Painel');
  const viewport = page.viewportSize()!;
  const host = page.getByTestId(mode.testId);
  const bottom = (r: Box) => r.y + r.height;

  if (mode.name === 'Partitura') {
    const panel = page.getByRole('region', { name: 'Nota atual' });
    if (on) {
      await expect(panel).toBeVisible();
      const panelBox = await rect(panel);
      expect(bottom(await rect(host)), `a pauta acima do painel em ${where}`).toBeLessThanOrEqual(panelBox.y + 0.5);
      expect(bottom(panelBox), `o painel dentro da tela em ${where}`).toBeLessThanOrEqual(viewport.height + 0.5);
    } else {
      await expect(panel).toBeHidden();
      await expect(page.getByRole('region', { name: 'Afinação ao vivo' })).toBeHidden();
    }
    const box = await rect(host);
    expect(bottom(box), `a pauta dentro da tela em ${where}`).toBeLessThanOrEqual(viewport.height + 0.5);
    // A faixa desenhada acompanha a caixa (a câmera da pauta refeita, como no resize)
    await expect.poll(async () => Math.round((await rect(host.locator('canvas'))).height), `canvas da pauta em ${where}`).toBe(Math.round(box.height));
    return box;
  }

  const expected = mode.name === 'Arcade' ? stageBox(viewport.width, viewport.height, on) : strings3dBox(viewport.width, viewport.height, undefined, on);
  await expect.poll(async () => (await rect(host)).height, `altura da pista em ${where}`).toBe(expected.height);
  const box = await rect(host);
  expect({ x: box.x, width: box.width, height: box.height }).toEqual({ x: expected.x, width: expected.width, height: expected.height });
  await expect.poll(async () => Math.round((await rect(host.locator('canvas'))).height), `canvas em ${where}`).toBe(expected.height);
  if (on) {
    const sheet = page.getByRole('region', { name: 'Partitura' });
    await expect(sheet.getByRole('img', { name: /^Partitura/ })).toBeVisible();
    const sheetBox = await rect(sheet);
    expect(sheetBox.y, `a pauta embaixo da pista em ${where}`).toBeGreaterThanOrEqual(bottom(box) - 0.5);
    expect(bottom(sheetBox), `a pauta no pé da tela em ${where}`).toBeCloseTo(viewport.height, 0);
    expect(sheetBox.height, `a pauta de 116 px em ${where}`).toBeCloseTo(116, 0);
    // Os cartões e os botões não descem sobre a pauta, nem o de afinação com o motivo do erro aberto (o mais alto)
    await expect(page.getByRole('region', { name: 'Afinação' }).getByRole('status')).toBeVisible({ timeout: 30000 });
    for (const [name, locator] of [
      ['placar', page.getByRole('region', { name: 'Placar' })],
      ['afinação', page.getByRole('region', { name: 'Afinação' })],
      ['pausar', page.getByRole('button', { name: 'Pausar' })],
      ['pauta', toggle],
    ] as const) {
      expect(overlaps(await rect(locator), sheetBox), `${name} × pauta em ${where}`).toBe(false);
    }
  } else {
    await expect(page.getByRole('region', { name: 'Partitura' })).toHaveCount(0);
    await expect(page.getByRole('progressbar', { name: 'Andamento da música' })).toBeVisible();
    expect(bottom(box), `a pista até o pé em ${where}`).toBeGreaterThanOrEqual(viewport.height - 1);
  }
  return box;
}

async function expectClean(page: Page, where: string) {
  await expectFits(page);
  expect(await tooSmallTargets(page), `toque abaixo de 44 px em ${where}`).toEqual([]);
  expect(await overlappingTargets(page), `controles sobrepostos em ${where}`).toEqual([]);
  expect(await tinyText(page), `texto abaixo de 12 px em ${where}`).toEqual([]);
}

for (const tema of ['caderno', 'palco', '8-bits'] as const) {
  for (const fonte of ['real', 'reserva'] as const) {
    test.describe(`botão Pauta · ${tema}, fonte ${fonte}`, () => {
      test.beforeEach(async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'celular', 'layout do celular deitado');
        await page.addInitScript((id) => localStorage.setItem('vh:theme', id), tema);
        if (fonte === 'reserva') await blockWebFonts(page);
      });

      for (const mode of TOGGLE_MODES) {
        test(`${mode.name}: alterna, guarda para a próxima partida e vale na pausa, em 844×390 e 932×430`, async ({ page }) => {
          test.setTimeout(150000);
          const ready = () => (fonte === 'real' ? fontsReady(page, tema) : fallbackFontsReady(page, tema));
          for (const viewport of VIEWPORTS) {
            await page.setViewportSize(viewport);
            const where = `${mode.name} ${viewport.width}×${viewport.height}`;
            await open(page, mode.path, mode.testId);
            await ready();
            await expect(page.getByRole('region', { name: 'Afinação' }).or(page.getByRole('region', { name: 'Afinação ao vivo' })).first()).toBeVisible();

            // Como começa: Arcade e Cordas 3D sem a pauta; Partitura com o painel
            const first = await expectToggleState(page, mode, mode.startsOn, `${where}, de início`);
            await expectClean(page, `${where}, de início`);
            const toggle = toggleOf(page, mode);
            const toggleBox = await rect(toggle);
            const pause = await rect(page.getByRole('button', { name: 'Pausar' }));
            // Perto do Pausar: na mesma linha, a até 1rem dele
            expect(Math.abs(toggleBox.y + toggleBox.height / 2 - (pause.y + pause.height / 2)), `na linha do Pausar em ${where}`).toBeLessThanOrEqual(1);
            expect(Math.min(Math.abs(toggleBox.x + toggleBox.width - pause.x), Math.abs(pause.x + pause.width - toggleBox.x)), `ao lado do Pausar em ${where}`).toBeLessThanOrEqual(16);

            // Alterna
            await toggle.click();
            const second = await expectToggleState(page, mode, !mode.startsOn, `${where}, alternado`);
            await expectClean(page, `${where}, alternado`);
            if (mode.name === 'Partitura') expect(second.height, `a pauta ganha a altura do painel em ${where}`).toBeGreaterThan(first.height + 80);
            else expect(second.height, `a pista encolhe para a pauta em ${where}`).toBe(first.height - 116);

            // Foco visível no botão, chegando pelo teclado (o :focus-visible não vale para o toque)
            await toggle.focus();
            await page.keyboard.press('Shift+Tab');
            await page.keyboard.press('Tab');
            await expect(toggle).toBeFocused();
            expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle), `foco em ${where}`).toBe('solid');

            // A partida seguinte já começa com a escolha
            await open(page, mode.path, mode.testId);
            await ready();
            await expectToggleState(page, mode, !mode.startsOn, `${where}, partida seguinte`);

            // Na pausa: um botão só, nos Ajustes rápidos, e o jogo segue parado
            await page.getByRole('button', { name: 'Pausar' }).click();
            const dialog = page.getByRole('dialog', { name: 'PAUSADO' });
            await expect(dialog).toBeVisible();
            const settings = page.getByRole('region', { name: 'Ajustes rápidos' });
            await expect(toggleOf(page, mode)).toHaveCount(1);
            await expect(settings.getByRole('button', { name: new RegExp(`^(Mostrar|Esconder) ${mode.thing}$`) })).toBeVisible();
            // O andamento da Pausa (escondido no celular deitado, mas no DOM) diz onde o relógio parou
            const andamento = dialog.locator('[role="progressbar"][aria-label="Andamento da música"]');
            const clock = await andamento.getAttribute('aria-valuenow');
            await expectClean(page, `${where}, pausa`);
            await settings.getByRole('button', { name: new RegExp(`^(Mostrar|Esconder) ${mode.thing}$`) }).click();
            await expect(toggleOf(page, mode)).toHaveAttribute('aria-pressed', String(mode.startsOn));
            await expect(dialog).toBeVisible();
            await expectClean(page, `${where}, pausa alternada`);
            expect(await andamento.getAttribute('aria-valuenow'), `relógio parado em ${where}`).toBe(clock);

            // Continuar volta ao jogo com a escolha da pausa (o estado de início, para o próximo tamanho)
            await page.keyboard.press('Escape');
            await expect(dialog).toBeHidden({ timeout: 10000 });
            await expectToggleState(page, mode, mode.startsOn, `${where}, depois da pausa`);
          }
        });
      }
    });
  }
}

test('Cordas 3D: girar de 932×430 para 844×390 refaz a caixa do celular', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'celular', 'layout do celular deitado');
  await page.setViewportSize({ width: 932, height: 430 });
  await open(page, `/jogo/3d?ouvido=simulado&${SONG}`, 'cordas-3d');
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await rect(page.getByTestId('cordas-3d'))).width).toBe(strings3dBox(844, 390).width);
  const canvas = await rect(page.getByTestId('cordas-3d').locator('canvas'));
  expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 652, height: 390 });
});

test('desktop 1280×720: pista, cordas e pauta como antes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'tela do desktop');
  await open(page, `/jogo?ouvido=simulado&${SONG}`, 'pista');
  expect(await rect(page.getByTestId('pista'))).toEqual({ x: 320, y: 0, width: 640, height: 550 });
  expect(stageBox(1280, 720)).toEqual({ x: 320, y: 0, width: 640, height: 550 });
  await expect(page.getByRole('region', { name: 'Partitura' }).getByRole('img', { name: /^Partitura/ })).toBeVisible();

  await open(page, `/jogo/3d?ouvido=simulado&${SONG}`, 'cordas-3d');
  expect(await rect(page.getByTestId('cordas-3d'))).toEqual({ x: 0, y: 0, width: 1280, height: 550 });
  await expect(page.getByRole('region', { name: 'Partitura' }).getByRole('img', { name: /^Partitura/ })).toBeVisible();
});

test('desktop 1280×720: sem botão Pauta nem Painel, mesmo com as escolhas do celular guardadas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'tela do desktop');
  await page.addInitScript(() => localStorage.setItem('vh:ajustes', JSON.stringify({ landscapeStaff: true, landscapePanel: false })));
  const toggles = page.getByRole('button', { name: /^(Mostrar|Esconder) (pauta|painel)$/ });

  await open(page, `/jogo?ouvido=simulado&${SONG}`, 'pista');
  expect(await rect(page.getByTestId('pista'))).toEqual({ x: 320, y: 0, width: 640, height: 550 });
  await expect(toggles).toHaveCount(0);
  await page.getByRole('button', { name: 'Pausar' }).click();
  await expect(page.getByRole('region', { name: 'Ajustes rápidos' })).toBeVisible();
  await expect(toggles).toHaveCount(0);

  await open(page, `/jogo/3d?ouvido=simulado&${SONG}`, 'cordas-3d');
  expect(await rect(page.getByTestId('cordas-3d'))).toEqual({ x: 0, y: 0, width: 1280, height: 550 });
  await expect(toggles).toHaveCount(0);

  await open(page, `/jogo/partitura?ouvido=simulado&${SONG}`, 'partitura');
  await expect(toggles).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Nota atual' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Afinação ao vivo' })).toBeVisible();
});

test('em pé: o aviso de girar, sem pista nem cordas', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'celular', 'celular');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/jogo?musica=escala-re-maior', '/jogo/3d?musica=escala-re-maior']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Gire o celular para tocar' })).toBeVisible();
    await expect(page.getByTestId('pista')).toHaveCount(0);
    await expect(page.getByTestId('cordas-3d')).toHaveCount(0);
  }
});
