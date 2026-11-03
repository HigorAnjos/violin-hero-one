import { expect, test, type Page } from '@playwright/test';
import { skipOnboarding } from '../choose';
import { fontsReady } from '../fonts';

/**
 * Capturas das fichas das lojas (playwright.lojas.config.ts). Só dados de exemplo: apelido, recordes e selos
 * inventados no aparelho, nenhuma conta nem servidor. O Ouvido simulado toca a música no lugar do violino.
 */
async function seedExample(page: Page) {
  await skipOnboarding(page);
  await page.addInitScript(() => {
    localStorage.setItem('vh:theme', 'caderno');
    localStorage.setItem('vh:profile', JSON.stringify({ level: 'some_songs', nickname: 'Lia', animal: 'fox' }));
    localStorage.setItem('vh:recordes', JSON.stringify({ 'ode-a-alegria:easy': 48250, 'escala-re-maior:easy': 61400 }));
    localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica', 'combo-25']));
    localStorage.setItem('vh:latency', JSON.stringify({ default: { latencySeconds: 0.09, confidence: 0.9, measuredAt: new Date().toISOString() } }));
  });
}

const SHOTS = [
  { file: '01-inicial', path: '/', ready: (p: Page) => expect(p.getByRole('navigation', { name: 'Menu principal' })).toBeVisible() },
  {
    file: '02-jogo',
    path: '/jogo?ouvido=simulado&musica=ode-a-alegria',
    ready: async (p: Page) => {
      await expect(p.getByRole('button', { name: 'Pausar' })).toBeEnabled({ timeout: 15000 });
      // Depois da contagem, com notas na pista e acertos no placar
      await p.waitForTimeout(6000);
    },
  },
  { file: '03-biblioteca', path: '/biblioteca', ready: (p: Page) => expect(p.getByRole('list', { name: 'Músicas' }).getByRole('link').first()).toBeVisible() },
  {
    file: '04-afinar',
    path: '/afinar?ouvido=simulado&musica=escala-re-maior',
    ready: async (p: Page) => {
      await expect(p.getByRole('region', { name: 'Afinador' })).toBeVisible();
      await p.waitForTimeout(1500);
    },
  },
];

test.beforeEach(async ({ page }) => {
  await seedExample(page);
});

for (const shot of SHOTS) {
  test(shot.file, async ({ page }, info) => {
    await page.goto(shot.path);
    await fontsReady(page, 'caderno');
    await shot.ready(page);
    // O build das capturas não tem servidor: a pílula "Offline" da sessão não é o que o jogador vê
    await page.getByRole('status').filter({ hasText: 'Offline' }).evaluateAll((pills) => pills.forEach((p) => ((p as HTMLElement).style.visibility = 'hidden')));
    await page.screenshot({ path: `store/screenshots/${info.project.name}/${shot.file}.png` });
  });
}
