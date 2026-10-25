import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { TAKE_LEAD_IN_SECONDS, e2eTakes, type TakeName } from '../../src/game/audio/testing/e2eTakes';
import { DEFAULT_SAMPLE_RATE } from '../../src/game/audio/testing/synth';
import { alignFirstOnset, decodeWav, encodeWav } from '../../src/game/audio/testing/wav';
import { parseSong } from '../../src/game/notation/song';

export type { TakeName };

const AUDIO_DIR = import.meta.dirname;
const SONGS_DIR = path.resolve(AUDIO_DIR, '../../content/songs');
export const SYNTHETIC_DIR = path.join(AUDIO_DIR, 'synthetic');
export const ALIGNED_DIR = path.join(AUDIO_DIR, 'aligned');

/** Gravações de música: a primeira nota precisa cair no lugar combinado com a partida. */
const SONG_TAKES: ReadonlySet<TakeName> = new Set(['escala-re-maior', 'escala-re-maior-vibrato', 'ode-a-alegria', 'ode-a-alegria-3-erros']);

/** E2E_AUDIO=sintetico ignora as gravações reais (para comparar as duas). */
const forceSynthetic = () => process.env.E2E_AUDIO === 'sintetico';

const realPath = (name: TakeName) => path.join(AUDIO_DIR, `${name}.wav`);

export function hasRealTake(name: TakeName): boolean {
  return !forceSynthetic() && existsSync(realPath(name));
}

/** O arquivo que o teste põe no lugar do microfone: a gravação real quando existe, senão a sintética. */
export function takePath(name: TakeName): string {
  if (!hasRealTake(name)) return path.join(SYNTHETIC_DIR, `${name}.wav`);
  return SONG_TAKES.has(name) ? path.join(ALIGNED_DIR, `${name}.wav`) : realPath(name);
}

const loadSong = (id: string) => parseSong(JSON.parse(readFileSync(path.join(SONGS_DIR, `${id}.json`), 'utf8')));

/** Grava as sintéticas e, das reais de música, uma cópia com a primeira nota no lead-in da partida. */
export function prepareTakes(): void {
  mkdirSync(SYNTHETIC_DIR, { recursive: true });
  mkdirSync(ALIGNED_DIR, { recursive: true });
  for (const take of e2eTakes(loadSong)) {
    writeFileSync(path.join(SYNTHETIC_DIR, `${take.name}.wav`), encodeWav(take.render(), DEFAULT_SAMPLE_RATE));
    if (!SONG_TAKES.has(take.name) || !hasRealTake(take.name)) continue;
    const real = decodeWav(readFileSync(realPath(take.name)));
    const aligned = alignFirstOnset(real.samples, real.sampleRate, TAKE_LEAD_IN_SECONDS);
    writeFileSync(path.join(ALIGNED_DIR, `${take.name}.wav`), encodeWav(aligned, real.sampleRate));
  }
}
