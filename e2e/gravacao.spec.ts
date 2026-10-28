import type { Page } from '@playwright/test';
import type { GameResult } from '../src/game/engine/types';
import { songDurationSeconds } from '../src/game/notation/song';
import type { DevWindow } from '../src/shell/devTools';
import { loadSong } from './audio/takes';
import { expect, test, warmAudio } from './microphone';

// Gravar é igual no celular; o áudio do microfone falso já roda no desktop
test.skip(({ isMobile }) => isMobile, 'gravação pelo microfone só no desktop');

const SONG = 'escala-re-maior';
const SONG_SECONDS = songDurationSeconds(loadSong(SONG));
/** A gravação também leva a entrada (a pista desce 2 s) e o fim do último julgamento. */
const MAX_EXTRA_SECONDS = 4;

interface Decoded {
  durationMs: number;
  mimeType: string;
  size: number;
  decodedMs: number;
  channels: number;
  peak: number;
}

/** A partida com o WAV no microfone; `gravar` liga a gravação da entrega (?gravar). */
async function play(micPage: (take: typeof SONG, options?: { loop?: boolean }) => Promise<Page>, gravar: boolean) {
  const page = await micPage(SONG, { loop: false });
  await page.addInitScript(() => {
    localStorage.setItem('vh:onboarded', '1');
    // Todos os selos já ganhos e orquestra desligada: o fim vai direto ao /resultado e nada é descartado
    localStorage.setItem('vh:badges', JSON.stringify(['primeira-musica', 'sem-erros', 'combo-25', 'combo-50', 'combo-100', 'afinacao-de-ouro']));
    localStorage.setItem('vh:orchestra', JSON.stringify({ enabled: false, headphones: true, volume: 0.8 }));
  });
  await warmAudio(page);
  await page.goto(`/jogo?musica=${SONG}${gravar ? '&gravar' : ''}`);
  await expect(page).toHaveURL(/\/resultado$/, { timeout: 90000 });
  const { result, lags } = await page.evaluate(() => {
    const w = window as Window & DevWindow;
    return { result: w.__vhResult, lags: w.__vhPitchLag ?? [] };
  });
  if (!result) throw new Error('a partida terminou sem window.__vhResult');
  const recording = await page.evaluate(async (): Promise<Decoded | string | null> => {
    const r = (window as Window & DevWindow).__vhRecording;
    if (!r) return null;
    if (!('blob' in r)) return r.kind;
    const buffer = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(await r.blob.arrayBuffer());
    let peak = 0;
    for (const s of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(s));
    return { durationMs: r.durationMs, mimeType: r.mimeType, size: r.blob.size, decodedMs: buffer.duration * 1000, channels: buffer.numberOfChannels, peak };
  });
  return { result, lags, recording };
}

/** Percentil `p` (0 a 1) em ms. */
const percentileMs = (values: readonly number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] * 1000;
};

const misses = (result: GameResult) => result.judgments.filter((j) => j.judgment === 'miss').map((j) => `${j.index}:${j.issue}`);

test('a partida de tarefa grava a entrega inteira sem atrasar o julgamento', async ({ micPage }) => {
  test.setTimeout(180000);
  const plain = await play(micPage, false);
  const recorded = await play(micPage, true);
  expect(plain.recording).toBeNull();
  for (const { result } of [plain, recorded]) expect(misses(result)).toEqual([]);

  // Da amostra ao motor (o caminho do som ao julgamento), com e sem o gravador ligado na mesma fonte
  const lag = (lags: number[]) => ({ median: percentileMs(lags, 0.5), p95: percentileMs(lags, 0.95) });
  const without = lag(plain.lags);
  const withRecording = lag(recorded.lags);
  const note =
    `sem gravar mediana ${without.median.toFixed(1)} ms, p95 ${without.p95.toFixed(1)} ms; ` +
    `gravando mediana ${withRecording.median.toFixed(1)} ms, p95 ${withRecording.p95.toFixed(1)} ms`;
  test.info().annotations.push({ type: 'leitura até o motor', description: note });
  console.log(`[gravação] leitura até o motor: ${note}`);
  expect(plain.lags.length).toBeGreaterThan(100);
  expect(recorded.lags.length).toBeGreaterThan(100);
  // Nesta máquina as medianas ficam a ±2 ms uma da outra: a folga é o ruído entre dois Chromium
  expect(withRecording.median - without.median).toBeLessThan(5);
  expect(withRecording.p95).toBeLessThan(50);

  const r = recorded.recording;
  if (!r || typeof r === 'string') throw new Error(`a gravação não saiu: ${r}`);
  const file = `${r.mimeType}, ${r.size} bytes, ${r.durationMs} ms (decodificado ${Math.round(r.decodedMs)} ms; música ${SONG_SECONDS} s)`;
  test.info().annotations.push({ type: 'gravação', description: file });
  console.log(`[gravação] ${file}`);
  expect(r.mimeType).toMatch(/^audio\/webm;codecs=opus/);
  expect(r.channels).toBe(1);
  // O arquivo tem a música inteira e a duração que a API diz
  expect(r.durationMs).toBeGreaterThanOrEqual(SONG_SECONDS * 1000);
  expect(r.durationMs).toBeLessThanOrEqual((SONG_SECONDS + MAX_EXTRA_SECONDS) * 1000);
  expect(Math.abs(r.decodedMs - r.durationMs)).toBeLessThan(300);
  // Tem som (o WAV do microfone), não silêncio, e cabe folgado: ~6 KB por segundo
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.size).toBeLessThan((r.durationMs / 1000) * 8 * 1024);
});
