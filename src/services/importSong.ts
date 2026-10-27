// Importar partitura (arquivo) ou salvar a melodia do editor: pela Edge Function import-song, que converte e grava no
// servidor. O app só manda o arquivo; o conversor nunca vem no pacote (os tipos abaixo são só de compilação).
import type { SupabaseClient } from '@supabase/supabase-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ImportErrorCode, PartChoice } from '../game/notation/importScore';
import { LEVELS, type Level, type TimeSignature } from '../game/notation/song';
import { ensureSession, type AuthClient, type SessionState } from './session';
import { songKeys, type CatalogEntry, type SongOrigin } from './songs';
import { supabase } from './supabase';

export type { PartChoice };

export type ImportInput =
  /** Arquivo do jogador; `part` é a parte escolhida quando a 1ª resposta foi a lista. */
  | { file: File; part?: string }
  /** Melodia do editor (formato Song); `replace` salva de novo a mesma música do editor. */
  | { song: unknown; replace?: string };

export type ImportResult =
  | { status: 'created'; song: CatalogEntry }
  /** Mais de uma parte de violino: o jogador escolhe e o app chama de novo com `part`. */
  | { status: 'choose-part'; parts: PartChoice[] };

export type ImportSongErrorCode = ImportErrorCode | 'offline';

const LOCAL_MESSAGES: Partial<Record<ImportSongErrorCode, string>> = {
  offline: 'Sem conexão. Importar partitura precisa de internet.',
  server: 'Não foi possível importar agora. Tente de novo em instantes.',
};

/** Erro com a mensagem pronta para a tela (a do servidor, em pt-BR) e o código para a tela decidir o que mostrar. */
export class ImportSongError extends Error {
  readonly code: ImportSongErrorCode;
  readonly detail?: string;

  constructor(code: ImportSongErrorCode, message?: string, detail?: string, cause?: unknown) {
    super(message || LOCAL_MESSAGES[code] || LOCAL_MESSAGES.server!, { cause });
    this.name = 'ImportSongError';
    this.code = code;
    this.detail = detail;
  }
}

export type ImportClient = { auth: AuthClient; functions: Pick<SupabaseClient['functions'], 'invoke'> };

interface SavedRow {
  id: string;
  title: string;
  composer: string;
  bpm: number | string;
  time_beats: number;
  time_unit: number;
  key: string;
  duration_seconds: number | string;
  origin: SongOrigin;
  levels: Level[] | null;
}

type Reply = { status: 'created'; song: SavedRow } | { status: 'choose-part'; parts: PartChoice[] };

function toEntry(row: SavedRow): CatalogEntry {
  const levels = new Set(row.levels ?? []);
  return {
    id: row.id,
    title: row.title,
    composer: row.composer,
    bpm: Number(row.bpm),
    timeSignature: { beats: row.time_beats, unit: row.time_unit as TimeSignature['unit'] },
    key: row.key,
    durationSeconds: Number(row.duration_seconds),
    origin: row.origin,
    levels: LEVELS.filter((l) => levels.has(l)),
  };
}

/** Erro do invoke: resposta da função (com código), falha de rede, ou o resto (servidor). */
async function fromInvokeError(error: unknown): Promise<ImportSongError> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    const body = (await context.json().catch(() => null)) as { error?: { code?: ImportErrorCode; message?: string; detail?: string } } | null;
    const code = body?.error?.code;
    if (code) return new ImportSongError(code, body.error?.message, body.error?.detail, error);
    return new ImportSongError('server', undefined, undefined, error);
  }
  if ((error as { name?: string }).name === 'FunctionsFetchError') return new ImportSongError('offline', undefined, undefined, error);
  return new ImportSongError('server', undefined, undefined, error);
}

export async function importSong(client: ImportClient | null, session: SessionState, input: ImportInput): Promise<ImportResult> {
  if (!client || session.status !== 'signed-in') throw new ImportSongError('offline');
  let body: FormData | { song: unknown; replace?: string };
  if ('file' in input) {
    body = new FormData();
    body.append('file', input.file, input.file.name);
    if (input.part) body.append('part', input.part);
  } else {
    body = input.replace ? { song: input.song, replace: input.replace } : { song: input.song };
  }
  const { data, error } = await client.functions.invoke<Reply>('import-song', { body });
  if (error) throw await fromInvokeError(error);
  if (data?.status === 'choose-part') return { status: 'choose-part', parts: data.parts };
  if (data?.status === 'created') return { status: 'created', song: toEntry(data.song) };
  throw new ImportSongError('server', undefined, 'resposta sem status');
}

/** Importa e, quando a música entra, atualiza a estante do dono. */
export function useImportSong(client: ImportClient | null = supabase) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportInput) => {
      const session = await queryClient.fetchQuery({ queryKey: ['session'], queryFn: () => ensureSession(client), staleTime: Infinity });
      return importSong(client, session, input);
    },
    onSuccess: (result) => {
      if (result.status === 'created') void queryClient.invalidateQueries({ queryKey: songKeys.mine });
    },
  });
}
