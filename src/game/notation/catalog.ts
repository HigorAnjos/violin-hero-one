// Ponto de entrada do seed-songs (scripts/seed-songs.mjs) e das músicas do bundle: arquivo → ficha + 3 níveis.
// Função pura, sem DOM nem fs: quem lê o arquivo é quem chama.
import { levelChart } from './levels';
import { parseMusicXml } from './musicxml';
import { LEVELS, songDurationSeconds, type Level, type Song, type TimeSignature } from './song';
import { child, children, parseXml } from './xml';

/** Ordem do catálogo decidida pelo Higor (nota Decisões): as músicas e, depois delas, os exercícios técnicos. */
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
  'staccato-la-maior',
  'moto-perpetuo-la-maior',
  'moto-perpetuo-quarto-dedo',
  'variacao-semicolcheias',
  'preparacao-variacao',
  'quarto-dedo-primeiro-preso',
  'tonalizacao-re-0-2-0-3',
  'tonalizacao-re-0-3-1-3',
  'escala-re-maior-minimas',
];

/** Grupo na Biblioteca: música ou exercício técnico (<miscellaneous-field name="categoria"> do MusicXML). */
export type SongCategory = 'musica' | 'exercicio';
const CATEGORIES: readonly SongCategory[] = ['musica', 'exercicio'];

/** Sem o campo, música; valor desconhecido é erro (a partitura do catálogo é corrigida na fonte). */
export function categoryOf(content: string): SongCategory {
  const fields = children(child(child(parseXml(content), 'identification'), 'miscellaneous'), 'miscellaneous-field');
  const raw = fields.find((f) => f.attributes.name === 'categoria')?.text.trim();
  if (raw === undefined) return 'musica';
  if (!(CATEGORIES as readonly string[]).includes(raw)) throw new RangeError(`categoria "${raw}" desconhecida (use ${CATEGORIES.join(' ou ')})`);
  return raw as SongCategory;
}

export interface SongSheet {
  /** Slug do arquivo, estável entre seeds. */
  id: string;
  title: string;
  composer: string;
  category: SongCategory;
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
  /** Dicas de corda e dedo da partitura que algum nível ignorou (não cabem nele); o seed mostra. */
  warnings: string[];
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
    const warnings: string[] = [];
    const warn = (message: string) => warnings.push(`${input.name}: ${message}`);
    const charts = Object.fromEntries(LEVELS.map((level) => [level, levelChart(score, id, level, warn)])) as Record<Level, Song>;
    const { title, composer, bpm, timeSignature } = charts.hard;
    return {
      sheet: {
        id,
        title,
        composer,
        category: categoryOf(input.content),
        key: charts.hard.key,
        bpm,
        timeSignature,
        durationSeconds: songDurationSeconds(charts.hard),
      },
      source: { format: 'musicxml', content: input.content },
      charts,
      warnings,
    };
  });
}

/** Só um nível, para quem não precisa dos três (as fixas do bundle usam só o Fácil). */
export function convertSongChart(input: { name: string; content: string }, level: Level): Song {
  const id = songIdFromFileName(input.name);
  return inFile(input.name, () => levelChart(parseMusicXml(input.content), id, level));
}
