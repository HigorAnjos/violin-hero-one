import type { SupabaseClient } from '@supabase/supabase-js';
import type { PartChoice } from '../game/notation/importScore';
import { LEVELS, parseSong, songDurationSeconds, type Level, type Song } from '../game/notation/song';
import { ensureSession, type AuthClient } from './session';
import type { SongCache } from './songCache';
import type { LoadedSong, SongOrigin, SongSheet } from './songs';

export type { PartChoice };

/**
 * Gravar música feita pela pessoa (editor) ou importada de arquivo (MusicXML, .mxl, MIDI, ABC) pela Edge Function
 * import-song. O conversor roda no servidor e nunca entra no app (Decisões, ciclo 4); a música fica privada do dono,
 * fora de ranking e desafio. A tela só conhece esta interface: o teste e o e2e passam o fake. (PartChoice é só tipo.)
 */
export interface SongImporter {
  /** Grava a Song escrita no editor (origin editor) e devolve como ela ficou no servidor, no mesmo nível. */
  saveEditorSong(song: Song): Promise<LoadedSong>;
  /** Importa o arquivo; `part` é a parte escolhida quando a 1ª resposta foi a lista. */
  importFile(file: File, part?: string): Promise<FileImportResult>;
}

export type FileImportResult =
  /** Música gravada: `saved` é o nível mais fácil que entrou (já pronto para tocar), `levels` os que existem. */
  | { status: 'created'; saved: LoadedSong; levels: Level[]; part?: PartChoice | null }
  /** Mais de uma parte de violino: a pessoa escolhe e a tela chama de novo com `part`. */
  | { status: 'choose-part'; parts: PartChoice[] };

/** `limit`: a pessoa chegou ao limite de músicas dela (409 da função). */
export type ImportErrorKind = 'offline' | 'invalid' | 'limit' | 'server';

const MESSAGES: Record<ImportErrorKind, string> = {
  offline: 'Sem conexão para salvar. O rascunho continua guardado no aparelho; tente de novo com internet.',
  invalid: 'O servidor recusou a partitura. Confira as notas e tente de novo.',
  limit: 'Você chegou ao limite de músicas suas. Apague alguma para salvar outra.',
  server: 'Não foi possível salvar agora. O rascunho continua guardado; tente de novo em instantes.',
};

export class ImportError extends Error {
  readonly kind: ImportErrorKind;
  /** Código da função (unknown_format, out_of_range, limit_reached…), quando ela respondeu com um. */
  readonly code?: string;

  /** `message`: a do servidor (pt-BR, mais precisa: "notas fora da extensão do violino"); sem ela, a da tela. */
  constructor(kind: ImportErrorKind, cause?: unknown, message?: string, code?: string) {
    super(message || MESSAGES[kind], { cause });
    this.name = 'ImportError';
    this.kind = kind;
    this.code = code;
  }
}

/** Nome da Edge Function (supabase/functions/import-song). */
export const IMPORT_FUNCTION = 'import-song';

export type ImportClient = { auth: AuthClient; functions: Pick<SupabaseClient['functions'], 'invoke'> };

/** O 201 da função: ficha, níveis, o chart de um nível e o hash dele. */
interface CreatedResponse {
  part?: PartChoice | null;
  status?: 'created';
  sheet?: Partial<SongSheet>;
  levels?: Level[];
  song?: unknown;
  hash?: string;
}

type ImportResponse = CreatedResponse | { status: 'choose-part'; parts: PartChoice[] };

/** A ficha da música salva, do jeito que a estante e o cache guardam. */
export function editorSheet(song: Song, origin: SongOrigin = 'editor'): SongSheet {
  const { id, title, composer, bpm, timeSignature, key } = song;
  return { id, title, composer, bpm, timeSignature, key, durationSeconds: songDurationSeconds(song), origin };
}

/** Recusa (415, 413, 422), limite (409) ou o resto; com o código e a mensagem que a função mandou. */
async function fromInvokeError(error: unknown): Promise<ImportError> {
  const context = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
  if (!context) {
    return new ImportError((error as { name?: string }).name === 'FunctionsFetchError' ? 'offline' : 'server', error);
  }
  const status = context.status ?? 0;
  const kind: ImportErrorKind = [413, 415, 422].includes(status) ? 'invalid' : status === 409 ? 'limit' : 'server';
  const body = (await context.json?.().catch(() => null)) as { error?: { code?: string; message?: string } } | null | undefined;
  // a mensagem do servidor vale para recusa e limite; erro de servidor fica com a da tela (diz do rascunho)
  return new ImportError(kind, error, kind === 'server' ? undefined : body?.error?.message, body?.error?.code);
}

function loaded(data: CreatedResponse | null, origin: SongOrigin): LoadedSong {
  let song: Song;
  try {
    song = parseSong(data?.song);
  } catch (e) {
    throw new ImportError('server', e);
  }
  if (!data?.hash) throw new ImportError('server');
  return { sheet: { ...editorSheet(song, origin), ...data.sheet, id: song.id, origin }, song, hash: data.hash };
}

/** O importador de verdade: a Edge Function, com a sessão (anônima basta) do dono. */
export function edgeSongImporter(client: ImportClient | null): SongImporter {
  async function invoke(body: FormData | Record<string, unknown>): Promise<ImportResponse | null> {
    if (!client) throw new ImportError('offline');
    const session = await ensureSession(client).catch(() => null);
    if (session?.status !== 'signed-in') throw new ImportError('offline');
    const { data, error } = await client.functions.invoke<ImportResponse>(IMPORT_FUNCTION, { body });
    if (error) throw await fromInvokeError(error);
    return data;
  }
  return {
    async saveEditorSong(song) {
      return loaded((await invoke({ origin: 'editor', song })) as CreatedResponse | null, 'editor');
    },
    async importFile(file, part) {
      const body = new FormData();
      body.append('file', file, file.name);
      if (part) body.append('part', part);
      const data = await invoke(body);
      if (data?.status === 'choose-part') return { status: 'choose-part', parts: data.parts };
      const saved = loaded(data, 'imported');
      const levels = new Set(data?.levels ?? [saved.song.level]);
      return { status: 'created', saved, levels: LEVELS.filter((l) => levels.has(l)), part: data?.part };
    },
  };
}

/**
 * Importador de mentira (testes e ?importacao=simulada no e2e): aceita qualquer Song válida, dá um id novo de
 * música escrita e guarda o que recebeu em `saved`. Arquivo vira uma melodia de uma nota (o conversor não roda no
 * app); arquivo com "quarteto" no nome pede para escolher a parte. `fail` faz a próxima gravação falhar com esse motivo.
 */
export function fakeSongImporter({ fail }: { fail?: ImportErrorKind } = {}): SongImporter & { saved: Song[] } {
  const saved: Song[] = [];
  return {
    saved,
    async saveEditorSong(song) {
      if (fail) throw new ImportError(fail);
      const stored = parseSong({ ...song, id: `escrita-${saved.length + 1}` });
      saved.push(stored);
      return { sheet: editorSheet(stored), song: stored, hash: `fake-${saved.length}` };
    },
    async importFile(file, part) {
      if (fail) throw new ImportError(fail);
      if (/quarteto/i.test(file.name) && !part) {
        return {
          status: 'choose-part',
          parts: [
            { id: 'P1', name: 'Violino I', notes: 1, lowest: 74, highest: 74, fits: true, violin: true },
            { id: 'P2', name: 'Violino II', notes: 1, lowest: 66, highest: 66, fits: true, violin: true },
          ],
        };
      }
      const stored = parseSong({
        formatVersion: 1,
        id: `importada-${saved.length + 1}`,
        title: file.name.replace(/\.[^.]*$/, '') || 'Importada',
        composer: '',
        key: 'D major',
        bpm: 80,
        timeSignature: { beats: 4, unit: 4 },
        level: 'easy',
        measures: [{ beats: 4, notes: [{ beat: 0, beats: 4, midi: 62, string: 1, finger: 0 }] }],
      });
      saved.push(stored);
      return { status: 'created', saved: { sheet: editorSheet(stored, 'imported'), song: stored, hash: `fake-${saved.length}` }, levels: ['easy'] };
    },
  };
}

/**
 * Salva e deixa a música no aparelho: "Jogar agora" abre na hora, mesmo se a rede cair logo depois. Sem espaço no
 * aparelho, a música salva continua valendo (só não toca sem internet).
 */
export async function saveAndKeep(importer: SongImporter, song: Song, cache: SongCache | null): Promise<LoadedSong> {
  const saved = await importer.saveEditorSong(song);
  await cache?.remember(saved, saved.song.level).catch(() => null);
  return saved;
}

/** O mesmo para o arquivo importado: o nível devolvido fica no aparelho. */
export async function importAndKeep(importer: SongImporter, file: File, part: string | undefined, cache: SongCache | null): Promise<FileImportResult> {
  const result = await importer.importFile(file, part);
  if (result.status === 'created') await cache?.remember(result.saved, result.saved.song.level).catch(() => null);
  return result;
}
