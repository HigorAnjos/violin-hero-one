// Grava o catálogo (songs + song_sources + song_charts) a partir de content/songs/, de forma
// idempotente: rodar de novo com os mesmos arquivos não muda nada. Roda como o servidor
// (DATABASE_URL), nunca pelo app. Uso: npm run seed:songs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import { runnerImport } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SONGS_DIR = join(root, 'content', 'songs');
const CONVERTER = join(root, 'src', 'game', 'notation', 'catalog.ts');

async function importTs(path) {
  const { module } = await runnerImport(path, { configFile: false, root, logLevel: 'error' });
  return module;
}

/** Cada .musicxml do diretório vira { sheet, source, charts } pelo conversor (convertSongFile). */
export async function loadCatalog(dir = SONGS_DIR) {
  const files = readdirSync(dir).filter((f) => extname(f) === '.musicxml').sort();
  const converter = await importTs(CONVERTER);
  const entries = files.map((file) => converter.convertSongFile({ name: file, content: readFileSync(join(dir, file), 'utf8') }));
  const order = converter.CATALOG_ORDER;
  const position = (e) => (order.includes(e.sheet.id) ? order.indexOf(e.sheet.id) : order.length);
  return entries.sort((a, b) => position(a) - position(b) || a.sheet.id.localeCompare(b.sheet.id));
}

/**
 * Upsert do catálogo no cliente dado, sem abrir nem fechar transação (quem chama decide).
 * Devolve quantas linhas mudaram por tabela: zero na segunda rodada com os mesmos arquivos.
 */
export async function seedCatalog(client, entries) {
  const changed = { songs: 0, song_sources: 0, song_charts: 0 };
  // Música que saiu de content/songs sai da estante, mas a linha fica (partidas e recordes apontam para ela)
  const shelved = await client.query(
    `update violinhero.songs set catalog_position = null
      where origin = 'catalog' and catalog_position is not null and not (id = any($1))`,
    [entries.map((e) => e.sheet.id)]);
  changed.songs += shelved.rowCount;
  for (const [position, { sheet, source, charts }] of entries.entries()) {
    const song = await client.query(
      `insert into violinhero.songs
         (id, title, composer, bpm, time_beats, time_unit, key, duration_seconds, origin, owner_id, visibility, catalog_position)
       values ($1, $2, $3, $4, $5, $6, $7, $8, 'catalog', null, 'public', $9)
       on conflict (id) do update set
         title = excluded.title, composer = excluded.composer, bpm = excluded.bpm,
         time_beats = excluded.time_beats, time_unit = excluded.time_unit, key = excluded.key,
         duration_seconds = excluded.duration_seconds, catalog_position = excluded.catalog_position
       where songs.origin = 'catalog'
         and (songs.title, songs.composer, songs.bpm, songs.time_beats, songs.time_unit, songs.key,
              songs.duration_seconds, songs.catalog_position)
             is distinct from
             (excluded.title, excluded.composer, excluded.bpm, excluded.time_beats, excluded.time_unit,
              excluded.key, excluded.duration_seconds, excluded.catalog_position)`,
      [sheet.id, sheet.title, sheet.composer ?? '', sheet.bpm, sheet.timeSignature.beats, sheet.timeSignature.unit,
        sheet.key ?? '', Math.round(sheet.durationSeconds * 100) / 100, position]);
    changed.songs += song.rowCount;
    const { rows } = await client.query(`select origin from violinhero.songs where id = $1`, [sheet.id]);
    if (rows[0]?.origin !== 'catalog') throw new Error(`${sheet.id}: já existe e não é do catálogo`);

    if (source) {
      const res = await client.query(
        `insert into violinhero.song_sources (song_id, format, file_name, content) values ($1, $2, $3, $4)
         on conflict (song_id) do update set format = excluded.format, file_name = excluded.file_name, content = excluded.content
         where (song_sources.format, song_sources.file_name, song_sources.content)
               is distinct from (excluded.format, excluded.file_name, excluded.content)`,
        [sheet.id, source.format, source.fileName ?? `${sheet.id}.${source.format}`, source.content]);
      changed.song_sources += res.rowCount;
    }

    for (const [level, chart] of Object.entries(charts)) {
      if (chart.id !== sheet.id || chart.level !== level) throw new Error(`${sheet.id}: chart ${level} não bate com a ficha`);
      const res = await client.query(
        `insert into violinhero.song_charts (song_id, level, format_version, chart) values ($1, $2, $3, $4)
         on conflict (song_id, level) do update set format_version = excluded.format_version, chart = excluded.chart
         where song_charts.chart is distinct from excluded.chart or song_charts.format_version <> excluded.format_version`,
        [sheet.id, level, chart.formatVersion, JSON.stringify(chart)]);
      changed.song_charts += res.rowCount;
    }
  }
  return changed;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({ path: '.env.local', quiet: true });
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL vazio: copie .env.example para .env.local e preencha.');
    process.exit(1);
  }
  const entries = await loadCatalog();
  // O Postgres do `supabase start` (127.0.0.1:54322) não aceita SSL; o da nuvem exige
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('begin');
    const changed = await seedCatalog(client, entries);
    await client.query('commit');
    console.log(`${entries.length} música(s) no catálogo; alteradas: ${JSON.stringify(changed)}`);
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    await client.end();
  }
}
