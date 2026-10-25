// Ponto de entrada do seed-songs (scripts/seed-songs.mjs) e das músicas do bundle: arquivo → ficha + 3 níveis.
// Função pura, sem DOM nem fs: quem lê o arquivo é quem chama.
import { levelChart } from './levels';
import { parseMusicXml } from './musicxml';
import { LEVELS, songDurationSeconds, type Level, type Song, type TimeSignature } from './song';

/** Ordem do catálogo decidida pelo Higor (nota Decisões). */
export const CATALOG_ORDER: readonly string[] = [
  'escala-re-maior',
  'brilha-brilha-estrelinha',
  'ode-a-alegria',
  'ciranda-cirandinha',
  'frere-jacques',
  'minueto-em-sol',
  'canone-de-pachelbel',
  'greensleeves',
  'jingle-bells',
  'aleluia',
];

export interface SongSheet {
  /** Slug do arquivo, estável entre seeds. */
  id: string;
  title: string;
  composer: string;
  /** Tonalidade da partitura; o Fácil pode vir transposto (cada chart traz a sua). */
  key: string;
  bpm: number;
  timeSignature: TimeSignature;
  durationSeconds: number;
}

export interface SongFile {
  sheet: SongSheet;
  source: { format: 'musicxml'; content: string };
  charts: Record<Level, Song>;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "content/songs/ode-a-alegria.musicxml" → "ode-a-alegria". */
export function songIdFromFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const match = /^(.*)\.musicxml$/.exec(base);
  if (!match) throw new RangeError(`"${name}": só .musicxml entra no catálogo`);
  if (!SLUG.test(match[1])) throw new RangeError(`"${name}": o nome do arquivo precisa ser um slug (a-z, 0-9 e hífen)`);
  return match[1];
}

function inFile<T>(name: string, convert: () => T): T {
  try {
    return convert();
  } catch (error) {
    throw new RangeError(`${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

export function convertSongFile(input: { name: string; content: string }): SongFile {
  const id = songIdFromFileName(input.name);
  return inFile(input.name, () => {
    const score = parseMusicXml(input.content);
    const charts = Object.fromEntries(LEVELS.map((level) => [level, levelChart(score, id, level)])) as Record<Level, Song>;
    const { title, composer, bpm, timeSignature } = charts.hard;
    return {
      sheet: { id, title, composer, key: charts.hard.key, bpm, timeSignature, durationSeconds: songDurationSeconds(charts.hard) },
      source: { format: 'musicxml', content: input.content },
      charts,
    };
  });
}

/** Só um nível, para quem não precisa dos três (as fixas do bundle usam só o Fácil). */
export function convertSongChart(input: { name: string; content: string }, level: Level): Song {
  const id = songIdFromFileName(input.name);
  return inFile(input.name, () => levelChart(parseMusicXml(input.content), id, level));
}
