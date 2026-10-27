import type { SupabaseClient } from '@supabase/supabase-js';
import { parseSong, songDurationSeconds, type Song } from '../game/notation/song';
import { ensureSession, type AuthClient } from './session';
import type { SongCache } from './songCache';
import type { LoadedSong, SongSheet } from './songs';

/**
 * Gravar música feita pela pessoa (editor; depois o arquivo importado) pelo serviço de importação. O conversor roda
 * numa Edge Function do Supabase e nunca entra no app (Decisões, ciclo 4); a música fica privada do dono, fora de
 * ranking e desafio. A tela só conhece esta interface: o teste e o e2e passam o fake.
 */
export interface SongImporter {
  /** Grava a Song escrita no editor (origin editor) e devolve como ela ficou no servidor. */
  saveEditorSong(song: Song): Promise<LoadedSong>;
}

export type ImportErrorKind = 'offline' | 'invalid' | 'server';

const MESSAGES: Record<ImportErrorKind, string> = {
  offline: 'Sem conexão para salvar. O rascunho continua guardado no aparelho; tente de novo com internet.',
  invalid: 'O servidor recusou a partitura. Confira as notas e tente de novo.',
  server: 'Não foi possível salvar agora. O rascunho continua guardado; tente de novo em instantes.',
};

export class ImportError extends Error {
  readonly kind: ImportErrorKind;

  constructor(kind: ImportErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'ImportError';
    this.kind = kind;
  }
}

/** Nome da Edge Function do floor ciclo4-import-funcao (a combinar com ele; até lá, só o fake responde). */
export const IMPORT_FUNCTION = 'import-song';

export type ImportClient = { auth: AuthClient; functions: Pick<SupabaseClient['functions'], 'invoke'> };

interface ImportResponse {
  sheet?: Partial<SongSheet>;
  song?: unknown;
  hash?: string;
}

/** A ficha da música salva, do jeito que a estante e o cache guardam. */
export function editorSheet(song: Song): SongSheet {
  const { id, title, composer, bpm, timeSignature, key } = song;
  return { id, title, composer, bpm, timeSignature, key, durationSeconds: songDurationSeconds(song), origin: 'editor' };
}

/** O importador de verdade: a Edge Function, com a sessão (anônima basta) do dono. */
export function edgeSongImporter(client: ImportClient | null): SongImporter {
  return {
    async saveEditorSong(song) {
      if (!client) throw new ImportError('offline');
      const session = await ensureSession(client).catch(() => null);
      if (session?.status !== 'signed-in') throw new ImportError('offline');
      const { data, error } = await client.functions.invoke<ImportResponse>(IMPORT_FUNCTION, { body: { origin: 'editor', song } });
      if (error) throw new ImportError((error as { context?: { status?: number } }).context?.status === 422 ? 'invalid' : 'server', error);
      let saved: Song;
      try {
        saved = parseSong(data?.song);
      } catch (e) {
        throw new ImportError('server', e);
      }
      if (!data?.hash) throw new ImportError('server');
      return { sheet: { ...editorSheet(saved), ...data.sheet, origin: 'editor' }, song: saved, hash: data.hash };
    },
  };
}

/**
 * Importador de mentira (testes e ?importacao=simulada no e2e): aceita qualquer Song válida, dá um id novo de
 * música escrita e guarda o que recebeu em `saved`. `fail` faz a próxima gravação falhar com esse motivo.
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
