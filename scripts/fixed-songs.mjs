// Gera src/game/notation/fixedSongs.json: o nível Fácil das músicas embutidas no app (primeiro uso e
// offline), convertido de content/songs/*.musicxml. O conversor roda aqui, nunca no pacote do app.
// Uso: npm run songs:fixed — rode depois de mudar uma das partituras; o songs.test acusa se esquecer.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXED_SONG_IDS = ['escala-re-maior', 'ode-a-alegria', 'brilha-brilha-estrelinha'];
const OUT = join(root, 'src', 'game', 'notation', 'fixedSongs.json');

const { module: catalog } = await runnerImport(join(root, 'src', 'game', 'notation', 'catalog.ts'), {
  configFile: false,
  root,
  logLevel: 'error',
});

const songs = FIXED_SONG_IDS.map((id) => {
  const name = `${id}.musicxml`;
  return catalog.convertSongChart({ name, content: readFileSync(join(root, 'content', 'songs', name), 'utf8') }, 'easy');
});
writeFileSync(OUT, `${JSON.stringify(songs, null, 2)}\n`);
console.log(`${songs.length} música(s) embutida(s) em ${OUT}`);
