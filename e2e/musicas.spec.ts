import type { Page } from '@playwright/test';
import { ODE_SLIP_ISSUES, type TakeName } from '../src/game/audio/testing/e2eTakes';
import type { BadgeId, GameResult } from '../src/game/engine/types';
import { expect, test, warmAudio } from './microphone';

// O áudio e o motor são os mesmos no celular; repetir as músicas lá só dobraria ~2,5 min de e2e
test.skip(({ isMobile }) => isMobile, 'músicas pelo microfone só no desktop');

const ALL_BADGES: BadgeId[] = ['primeira-musica', 'sem-erros', 'combo-25', 'combo-50', 'combo-100', 'afinacao-de-ouro'];

type GameWindow = Window & { __vhResult?: GameResult; __vhHints?: string[] };

/** Padrão: orquestra desligada e "com fone", nada é descartado como vazamento dela. */
const NO_ORCHESTRA = { enabled: false, headphones: true };

/**
 * A partida em /jogo?musica=<id> com o WAV no microfone. Sem calibração salva vale a latência padrão, que o lead-in
 * do WAV já desconta. Todos os selos já ganhos: o fim vai direto ao /resultado. Sem orquestra (padrão), nem a nota
 * errada que cair num acorde é descartada. O atraso da 1ª nota fica anotado no relatório (e no console), para medir o
 * começo a frio.
 */
async function play(
  micPage: (take: TakeName, options?: { loop?: boolean }) => Promise<Page>,
  songId: string,
  take: TakeName,
  orchestra: { enabled: boolean; headphones: boolean } = NO_ORCHESTRA
) {
  const page = await micPage(take, { loop: false });
  await page.addInitScript(
    ({ badges, orchestra }) => {
      localStorage.setItem('vh:onboarded', '1');
      localStorage.setItem('vh:badges', JSON.stringify(badges));
      localStorage.setItem('vh:orchestra', JSON.stringify({ ...orchestra, volume: 0.8 }));
      const hints: string[] = ((window as GameWindow).__vhHints = []);
      new MutationObserver(() => {
        for (const el of document.querySelectorAll('[role="status"][aria-live="polite"]')) {
          const text = el.textContent?.trim();
          if (text && hints[hints.length - 1] !== text) hints.push(text);
        }
      }).observe(document, { subtree: true, childList: true, characterData: true });
    },
    { badges: ALL_BADGES, orchestra }
  );
  await warmAudio(page);
  await page.goto(`/jogo?musica=${songId}`);
  await expect(page).toHaveURL(/\/resultado$/, { timeout: 90000 });
  await expect(page.getByTestId('resultado')).toBeVisible();
  const result = await page.evaluate(() => (window as GameWindow).__vhResult);
  const hints = await page.evaluate(() => (window as GameWindow).__vhHints ?? []);
  if (!result) throw new Error('a partida terminou sem window.__vhResult');
  const first = result.judgments[0];
  const offset = first?.offsetMs == null ? 'não ouvida' : `${Math.round(first.offsetMs)} ms`;
  test.info().annotations.push({ type: 'atraso da 1ª nota', description: offset });
  console.log(`[${take}] atraso da 1ª nota: ${offset}`);
  return { page, result, hints };
}

const missCount = (page: Page) => page.getByLabel('Julgamentos').getByText('Errou').locator('..').locator('b');

const misses = (result: GameResult) => result.judgments.filter((j) => j.judgment === 'miss').map((j) => `${j.index}:${j.issue}`);

for (const [songId, take] of [
  ['escala-re-maior', 'escala-re-maior'],
  ['escala-re-maior', 'escala-re-maior-vibrato'],
  ['ode-a-alegria', 'ode-a-alegria'],
] as const) {
  test(`${take} limpa pelo microfone: tudo acerta`, async ({ micPage }) => {
    test.setTimeout(120000);
    const { page, result } = await play(micPage, songId, take);
    expect(result.status).toBe('finished');
    expect(misses(result)).toEqual([]);
    await expect(missCount(page)).toHaveText('0');
  });
}

// A máscara da orquestra (sem fone) descarta o que soa como ela; o violino tocando a mesma nota que a orquestra
// não pode cair junto
test('Ode limpa com orquestra ligada e sem fone: a máscara não descarta nota certa', async ({ micPage }) => {
  test.setTimeout(120000);
  const { page, result } = await play(micPage, 'ode-a-alegria', 'ode-a-alegria', { enabled: true, headphones: false });
  expect(result.status).toBe('finished');
  expect(misses(result)).toEqual([]);
  await expect(missCount(page)).toHaveText('0');
});

test('Ode com 3 erros pelo microfone: os 3 motivos certos', async ({ micPage }) => {
  test.setTimeout(120000);
  const { page, result, hints } = await play(micPage, 'ode-a-alegria', 'ode-a-alegria-3-erros');
  const wrong = result.judgments.filter((j) => j.judgment === 'miss');
  expect(Object.fromEntries(wrong.map((j) => [j.index, j.issue]))).toEqual(ODE_SLIP_ISSUES);
  expect(result.status).toBe('finished');
  await expect(missCount(page)).toHaveText('3');
  expect(hints.some((h) => /Você tocou .*O alvo era/.test(h))).toBe(true);
  expect(hints.some((h) => /\d+ ms atrasada/.test(h))).toBe(true);
  expect(hints.some((h) => /\d+ ¢ alta/.test(h))).toBe(true);
});
