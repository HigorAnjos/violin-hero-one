import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { CATALOG_ORDER, convertSongFile, type SongFile } from '../../src/game/notation/catalog';

const SONGS_DIR = path.resolve(import.meta.dirname, '../../content/songs');

/**
 * O que o seed-songs gravou no banco, pelo mesmo conversor e na ordem da estante: o e2e compara a tela com isso,
 * sem lista de títulos copiada à mão.
 */
export const CATALOG: readonly SongFile[] = readdirSync(SONGS_DIR)
  .filter((file) => file.endsWith('.musicxml'))
  .map((file) => convertSongFile({ name: file, content: readFileSync(path.join(SONGS_DIR, file), 'utf8') }))
  .sort((a, b) => CATALOG_ORDER.indexOf(a.sheet.id) - CATALOG_ORDER.indexOf(b.sheet.id));
