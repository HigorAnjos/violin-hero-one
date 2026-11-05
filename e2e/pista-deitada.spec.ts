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
