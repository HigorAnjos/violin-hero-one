// Importação de partitura do jogador: arquivo (MusicXML, .mxl, MIDI, ABC) ou melodia do editor → ficha + níveis.
// Função pura, sem rede nem banco: quem chama (a Edge Function import-song) grava. Nunca entra no pacote do app.
import { parseAbcParts, looksLikeAbc } from './abc.ts';
import { isComfortableKey, LEVEL_RULES, levelChart, levelShift, transposeKey } from './levels.ts';
import { isMidi, parseMidiParts } from './midi.ts';
import { DEFAULT_KEY, parseMusicXmlParts, tidy, type KeySignature, type Score, type ScoreMeasure, type ScorePart } from './musicxml.ts';
import { isZip, unzipMusicXml } from './mxl.ts';
import { LEVELS, songDurationSeconds, type Level, type Song, type TimeSignature } from './song.ts';

export const IMPORT_LIMITS = {
  /** Tamanho do arquivo enviado (e do corpo JSON do editor). */
  fileBytes: 1024 * 1024,
  /** Ataques no nível Difícil (depois de desdobrar as repetições). */
  notes: 3000,
  /** Duração no andamento escrito. */
  seconds: 15 * 60,
  /** Músicas importadas ou do editor por jogador (conferido de novo no banco, em import_song). */
  songsPerUser: 50,
} as const;

export type ImportFormat = 'musicxml' | 'mxl' | 'midi' | 'abc';
/** Formato guardado em song_sources: o do arquivo, ou 'song' (JSON do editor). */
export type SourceFormat = ImportFormat | 'song';

export type ImportErrorCode =
  | 'unknown_format'
  | 'invalid_file'
  | 'file_too_large'
  | 'no_violin_part'
  | 'part_not_found'
  | 'out_of_range'
  | 'too_many_notes'
  | 'too_long'
  | 'limit_reached'
  | 'invalid_song'
  | 'unauthorized'
  | 'server';

/** Mensagens para a tela (pt-BR); o app mostra a do código, o detalhe técnico vai em `detail`. */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorCode, string> = {
  unknown_format: 'Formato não reconhecido. Envie MusicXML (.musicxml, .xml ou .mxl), MIDI (.mid) ou ABC (.abc).',
  invalid_file: 'Não conseguimos ler esse arquivo. Ele pode estar corrompido ou usar algo que ainda não entendemos.',
  file_too_large: 'Arquivo grande demais: o limite é 1 MB.',
  no_violin_part: 'Não achamos nenhuma parte que caiba no violino nessa partitura.',
  part_not_found: 'Essa parte não existe na partitura. Escolha outra da lista.',
  out_of_range: 'Essa melodia tem notas fora da extensão do violino (do Sol grave ao Mi agudo da 3ª posição).',
  too_many_notes: `Música longa demais: o limite é de ${IMPORT_LIMITS.notes} notas.`,
  too_long: `Música longa demais: o limite é de ${IMPORT_LIMITS.seconds / 60} minutos.`,
  limit_reached: `Você chegou ao limite de ${IMPORT_LIMITS.songsPerUser} músicas suas. Apague alguma para importar outra.`,
  invalid_song: 'A música do editor chegou com problema e não foi salva.',
  unauthorized: 'Sua sessão expirou. Abra o jogo de novo e tente outra vez.',
  server: 'Não foi possível importar agora. Tente de novo em instantes.',
};

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly detail?: string;

  constructor(code: ImportErrorCode, detail?: string) {
    super(IMPORT_ERROR_MESSAGES[code]);
    this.name = 'ImportError';
    this.code = code;
    this.detail = detail;
  }
}

/** Parte que o jogador pode escolher quando a partitura tem mais de uma candidata. */
export interface PartChoice {
  id: string;
  name: string;
  notes: number;
  lowest: number;
  highest: number;
  /** Cabe no violino até a 3ª posição (mudando de oitava, se preciso). */
  fits: boolean;
  violin: boolean;
}

export interface ImportedSheet {
  title: string;
  composer: string;
  key: string;
  bpm: number;
  timeSignature: TimeSignature;
  durationSeconds: number;
}

export interface ImportedSong {
  sheet: ImportedSheet;
  /** Os níveis que couberam (o Fácil pode faltar quando a melodia não cabe na 1ª posição). */
  charts: Partial<Record<Level, Song>>;
  levels: Level[];
  source: { format: SourceFormat; fileName: string; content: string };
  /** A parte usada; nula no editor. */
  part: PartChoice | null;
}

export type ImportOutcome = { kind: 'song'; song: ImportedSong } | { kind: 'choose-part'; parts: PartChoice[] };

const EXTENSIONS: Record<ImportFormat, readonly string[]> = {
  musicxml: ['musicxml', 'xml'],
  mxl: ['mxl'],
  midi: ['mid', 'midi'],
  abc: ['abc'],
};

const VIOLIN_PROGRAM = 40;
const VIOLIN_NAME = /\b(violin[eoa]?|violon|vln|vl|fiddle|rabeca)\b/i;
const MAX_TITLE = 120;

const extensionOf = (fileName: string) => /\.([a-z0-9]+)$/i.exec(fileName)?.[1].toLowerCase() ?? '';

function decodeText(bytes: Uint8Array): string {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new ImportError('unknown_format', 'texto que não é UTF-8 nem UTF-16');
  }
}

/** O formato pelo conteúdo; a extensão precisa concordar (arquivo renomeado ou forjado é recusado). */
export function detectFormat(fileName: string, bytes: Uint8Array): ImportFormat {
  const extension = extensionOf(fileName);
  let format: ImportFormat;
  if (isMidi(bytes)) format = 'midi';
  else if (isZip(bytes)) format = 'mxl';
  else {
    const head = decodeText(bytes.subarray(0, 4096));
    if (/<score-partwise[\s>]/.test(head)) format = 'musicxml';
    else if (looksLikeAbc(decodeText(bytes))) format = 'abc';
    else throw new ImportError('unknown_format', `conteúdo não reconhecido (.${extension})`);
  }
  if (!EXTENSIONS[format].includes(extension)) throw new ImportError('unknown_format', `conteúdo ${format} com extensão .${extension}`);
  return format;
}

const scoreMidis = (score: Score) => score.measures.flatMap((m) => m.notes.map((n) => n.midi));

function fits(score: Score): boolean {
  if (!scoreMidis(score).length) return false;
  try {
    levelShift(score, LEVEL_RULES.hard);
    return true;
  } catch {
    return false;
  }
}

function choiceOf(part: ScorePart): PartChoice {
  const midis = scoreMidis(part.score);
  return {
    id: part.id,
    name: part.name,
    notes: midis.length,
    lowest: midis.length ? Math.min(...midis) : 0,
    highest: midis.length ? Math.max(...midis) : 0,
    fits: fits(part.score),
    violin: part.instrument === VIOLIN_PROGRAM || VIOLIN_NAME.test(part.name),
  };
}

const mean = (part: ScorePart) => {
  const midis = scoreMidis(part.score);
  return midis.reduce((a, b) => a + b, 0) / midis.length;
};

/**
 * A parte que vira música: a pedida; senão a única de violino que cabe; senão a mais aguda que cabe. Mais de uma de
 * violino (Violino I e II) devolve a lista para o jogador escolher.
 */
export function choosePart(parts: readonly ScorePart[], wanted?: string): { part: ScorePart; choice: PartChoice } | { parts: PartChoice[] } {
  const choices = new Map(parts.map((p) => [p, choiceOf(p)]));
  if (wanted !== undefined) {
    const part = parts.find((p) => p.id === wanted);
    if (!part) throw new ImportError('part_not_found', wanted);
    const choice = choices.get(part)!;
    if (!choice.fits) throw new ImportError('out_of_range', `parte ${wanted}`);
    return { part, choice };
  }
  const withNotes = parts.filter((p) => choices.get(p)!.notes > 0);
  const fitting = withNotes.filter((p) => choices.get(p)!.fits);
  const violins = withNotes.filter((p) => choices.get(p)!.violin);
  const fittingViolins = violins.filter((p) => choices.get(p)!.fits);
  if (!withNotes.length) throw new ImportError('no_violin_part', 'nenhuma parte com notas');
  if (fittingViolins.length === 1) return { part: fittingViolins[0], choice: choices.get(fittingViolins[0])! };
  if (fittingViolins.length > 1) {
    const listed = [...fittingViolins, ...withNotes.filter((p) => !fittingViolins.includes(p))];
    return { parts: listed.map((p) => choices.get(p)!) };
  }
  if (violins.length || (withNotes.length === 1 && !fitting.length)) throw new ImportError('out_of_range');
  if (!fitting.length) throw new ImportError('no_violin_part');
  const best = fitting.reduce((a, b) => (mean(b) > mean(a) ? b : a));
  return { part: best, choice: choices.get(best)! };
}

/** "minha_musica-final.mid" → "minha musica final". */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[^.]*$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const clip = (text: string, max: number) => text.replace(/\s+/g, ' ').trim().slice(0, max).trim();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Extensão da 1ª posição: do Sol solto ao 4º dedo na corda Mi. */
const FIRST_POSITION = { lowest: 55, highest: 83 };

/**
 * Melodia que não cabe inteira na 1ª posição em tom confortável: com a menor transposição para um tom confortável,
 * cada nota de fora desce (ou sobe) uma oitava até caber. Nulo se nem assim (não acontece com melodia que cabe no
 * violino). A nota ligada dobra igual à anterior, então a ligadura se mantém.
 */
function foldForEasy(score: Score): Score | null {
  const shifts = [...Array(25).keys()].map((i) => i - 12).sort((a, b) => (a % 12 === 0 ? 0 : 1) - (b % 12 === 0 ? 0 : 1) || Math.abs(a) - Math.abs(b) || a - b);
  const shift = shifts.find((s) => isComfortableKey(transposeKey(score.key, s)));
  if (shift === undefined) return null;
  const fold = (midi: number) => {
    let m = midi + shift;
    while (m > FIRST_POSITION.highest) m -= 12;
    while (m < FIRST_POSITION.lowest) m += 12;
    return m - shift;
  };
  return { ...score, measures: score.measures.map((m) => ({ ...m, notes: m.notes.map((n) => ({ ...n, midi: fold(n.midi) })) })) };
}

/** Os níveis que cabem, com os limites de tamanho conferidos no Difícil. */
function buildSong(score: Score, id: string, source: ImportedSong['source'], part: PartChoice | null): ImportedSong {
  // o que não é extensão e ainda assim não vira chart é defeito da entrada
  const invalid: ImportErrorCode = source.format === 'song' ? 'invalid_song' : 'invalid_file';
  const title = clip(score.title, MAX_TITLE) || 'Sem título';
  const bpm = Math.round(score.bpm * 100) / 100;
  if (!(bpm > 0 && bpm <= 400)) throw new ImportError('invalid_file', `andamento ${score.bpm}`);
  const ready: Score = { ...score, title, composer: clip(score.composer, MAX_TITLE), bpm };
  const charts: Partial<Record<Level, Song>> = {};
  for (const level of LEVELS) {
    try {
      charts[level] = levelChart(ready, id, level);
    } catch (error) {
      if (level !== 'easy') throw new ImportError(fits(ready) ? invalid : 'out_of_range', error instanceof Error ? error.message : String(error));
      // o Fácil pede a 1ª posição: melodia larga demais para ela dobra por oitava as notas que sobram
      const folded = foldForEasy(ready);
      try {
        if (folded) charts.easy = levelChart(folded, id, level);
      } catch {
        // sem Fácil: o Médio e o Difícil decidem se a música entra
      }
    }
  }
  const hard = charts.hard!;
  const attacks = hard.measures.reduce((n, m) => n + m.notes.filter((x) => !x.tie).length, 0);
  if (attacks > IMPORT_LIMITS.notes) throw new ImportError('too_many_notes', `${attacks} notas`);
  const durationSeconds = Math.round(songDurationSeconds(hard) * 100) / 100;
  if (durationSeconds > IMPORT_LIMITS.seconds) throw new ImportError('too_long', `${durationSeconds} s`);
  return {
    sheet: { title, composer: hard.composer, key: hard.key, bpm, timeSignature: hard.timeSignature, durationSeconds },
    charts,
    levels: LEVELS.filter((l) => charts[l]),
    source,
    part,
  };
}

async function partsOf(format: ImportFormat, bytes: Uint8Array, title: string): Promise<{ parts: ScorePart[]; content: string }> {
  switch (format) {
    case 'musicxml': {
      const text = decodeText(bytes);
      return { parts: parseMusicXmlParts(text), content: text };
    }
    case 'mxl':
      return { parts: parseMusicXmlParts(await unzipMusicXml(bytes)), content: toBase64(bytes) };
    case 'midi':
      return { parts: parseMidiParts(bytes, title), content: toBase64(bytes) };
    case 'abc': {
      const text = decodeText(bytes);
      return { parts: parseAbcParts(text, title), content: text };
    }
  }
}

/**
 * Arquivo do jogador → música (com `id` nos charts) ou a lista de partes para escolher. `part` é a escolha feita na
 * segunda chamada. Lança ImportError com o código do problema.
 */
export async function importFile(input: { fileName: string; bytes: Uint8Array; part?: string }, id: string): Promise<ImportOutcome> {
  if (input.bytes.length > IMPORT_LIMITS.fileBytes) throw new ImportError('file_too_large', `${input.bytes.length} bytes`);
  if (!input.bytes.length) throw new ImportError('unknown_format', 'arquivo vazio');
  const fileName = clip(input.fileName.split(/[\\/]/).pop() ?? '', 200) || 'partitura';
  const format = detectFormat(fileName, input.bytes);
  const fallback = titleFromFileName(fileName);
  let read: { parts: ScorePart[]; content: string };
  try {
    read = await partsOf(format, input.bytes, fallback);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    throw new ImportError('invalid_file', error instanceof Error ? error.message : String(error));
  }
  const chosen = choosePart(read.parts, input.part);
  if ('parts' in chosen) return { kind: 'choose-part', parts: chosen.parts };
  const score = { ...chosen.part.score, title: chosen.part.score.title || fallback };
  return { kind: 'song', song: buildSong(score, id, { format, fileName, content: read.content }, chosen.choice) };
}

/** "D major" / "F# minor" → armadura (o inverso de keyName). */
function keyFromName(name: unknown): KeySignature {
  const match = /^([A-G][#b]?)\s+(major|minor)$/.exec(String(name ?? '').trim());
  if (!match) return DEFAULT_KEY;
  const major = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'];
  const minor = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
  const mode = match[2] as KeySignature['mode'];
  const index = (mode === 'minor' ? minor : major).indexOf(match[1]);
  return index < 0 ? DEFAULT_KEY : { fifths: index - 7, mode };
}

const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

/**
 * Melodia do editor (o formato Song, de qualquer nível; corda e dedo são refeitos aqui) → música com os 3 níveis.
 * O original guardado é o JSON recebido.
 */
export function importEditorSong(raw: unknown, id: string): ImportOutcome {
  const v = (raw ?? {}) as Partial<Song>;
  const ts = (v.timeSignature ?? {}) as Partial<TimeSignature>;
  const content = JSON.stringify(raw ?? null);
  if (content.length > IMPORT_LIMITS.fileBytes) throw new ImportError('file_too_large', `${content.length} bytes`);
  if (
    !v ||
    typeof v !== 'object' ||
    !Array.isArray(v.measures) ||
    !finite(v.bpm) ||
    !Number.isInteger(ts.beats) ||
    ![2, 4, 8].includes(ts.unit as number)
  ) {
    throw new ImportError('invalid_song', 'faltam compassos, andamento ou fórmula de compasso');
  }
  const measures: ScoreMeasure[] = v.measures.map((m, mi) => {
    if (!m || !finite(m.beats) || !Array.isArray(m.notes)) throw new ImportError('invalid_song', `compasso ${mi + 1}`);
    return {
      beats: m.beats,
      notes: m.notes.map((n, ni) => {
        if (!n || !finite(n.beat) || !finite(n.beats) || !Number.isInteger(n.midi)) {
          throw new ImportError('invalid_song', `compasso ${mi + 1}, nota ${ni + 1}`);
        }
        return n.tie === true ? { beat: n.beat, beats: n.beats, midi: n.midi, tie: true } : { beat: n.beat, beats: n.beats, midi: n.midi };
      }),
    };
  });
  const score: Score = {
    title: typeof v.title === 'string' ? v.title : '',
    composer: typeof v.composer === 'string' ? v.composer : '',
    key: keyFromName(v.key),
    bpm: tidy(v.bpm as number),
    timeSignature: { beats: ts.beats as number, unit: ts.unit as TimeSignature['unit'] },
    measures,
  };
  if (!scoreMidis(score).length) throw new ImportError('invalid_song', 'música sem notas');
  if (!fits(score)) throw new ImportError('out_of_range');
  return { kind: 'song', song: buildSong(score, id, { format: 'song', fileName: 'editor.json', content }, null) };
}
