// Edge Function import-song: converte no servidor o arquivo do jogador (MusicXML, .mxl, MIDI, ABC) ou a melodia do
// editor e grava como música privada dele, por violinhero.import_song. O conversor é o mesmo de src/game/notation
// (o do seed), importado daqui: nunca vai para o pacote do app. A chave de serviço só existe no ambiente do Supabase.
//
// POST multipart/form-data: file (o arquivo), part (opcional: a parte escolhida na 2ª chamada)
// POST application/json: { song } (melodia do editor) e, para salvar de novo a mesma, { replace: "<id>" }
// Resposta: 201 { status: "created", song }, 200 { status: "choose-part", parts }, ou { error: { code, message } }
import { createClient } from '@supabase/supabase-js';
import {
  IMPORT_LIMITS,
  importEditorSong,
  importFile,
  ImportError,
  type ImportErrorCode,
  type ImportOutcome,
} from '../../../src/game/notation/importScore.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const STATUS: Record<ImportErrorCode, number> = {
  unknown_format: 415,
  invalid_file: 422,
  file_too_large: 413,
  no_violin_part: 422,
  part_not_found: 422,
  out_of_range: 422,
  too_many_notes: 422,
  too_long: 422,
  limit_reached: 409,
  invalid_song: 422,
  unauthorized: 401,
  server: 500,
};

/** Folga do multipart (cabeçalhos e fronteiras) sobre o limite do arquivo. */
const MULTIPART_SLACK = 64 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const fail = (error: ImportError) =>
  json(STATUS[error.code], { error: { code: error.code, message: error.message, ...(error.detail ? { detail: error.detail } : {}) } });

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} vazio no ambiente da função`);
  return value;
};

type Request_ =
  | { kind: 'file'; fileName: string; bytes: Uint8Array; part?: string }
  | { kind: 'editor'; song: unknown; replace?: string };

async function readRequest(req: Request): Promise<Request_> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > IMPORT_LIMITS.fileBytes + MULTIPART_SLACK) throw new ImportError('file_too_large', `${length} bytes`);
  const type = req.headers.get('content-type') ?? '';
  if (type.startsWith('multipart/form-data')) {
    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) throw new ImportError('unknown_format', 'sem o campo "file"');
    if (file.size > IMPORT_LIMITS.fileBytes) throw new ImportError('file_too_large', `${file.size} bytes`);
    const part = form?.get('part');
    return { kind: 'file', fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()), part: typeof part === 'string' && part ? part : undefined };
  }
  if (type.startsWith('application/json')) {
    const text = await req.text();
    if (text.length > IMPORT_LIMITS.fileBytes + MULTIPART_SLACK) throw new ImportError('file_too_large', `${text.length} bytes`);
    let body: { song?: unknown; replace?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      throw new ImportError('invalid_song', 'JSON inválido');
    }
    if (!body || typeof body !== 'object' || body.song === undefined) throw new ImportError('invalid_song', 'sem o campo "song"');
    return { kind: 'editor', song: body.song, replace: typeof body.replace === 'string' ? body.replace : undefined };
  }
  throw new ImportError('unknown_format', `content-type ${type || 'vazio'}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: { code: 'server', message: 'Use POST.' } });
  try {
    const url = env('SUPABASE_URL');
    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new ImportError('unauthorized', 'sem Authorization');
    // O dono vem do JWT conferido no Auth (anônimo vale); nunca de um campo do corpo
    const asPlayer = createClient(url, env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error: authError } = await asPlayer.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (authError || !data.user) throw new ImportError('unauthorized', authError?.message);
    const owner = data.user.id;

    const input = await readRequest(req);
    const server = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      db: { schema: 'violinhero' },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const replace = input.kind === 'editor' ? input.replace : undefined;
    if (!replace) {
      // conferido de novo (com trava) em import_song; aqui só poupa a conversão de quem já está no limite
      const { count, error } = await server.from('songs').select('id', { count: 'exact', head: true }).eq('owner_id', owner);
      if (error) throw error;
      if ((count ?? 0) >= IMPORT_LIMITS.songsPerUser) throw new ImportError('limit_reached');
    }

    const id = replace ?? crypto.randomUUID();
    const outcome: ImportOutcome =
      input.kind === 'file'
        ? await importFile({ fileName: input.fileName, bytes: input.bytes, part: input.part }, id)
        : importEditorSong(input.song, id);
    if (outcome.kind === 'choose-part') return json(200, { status: 'choose-part', parts: outcome.parts });

    const { sheet, charts, source } = outcome.song;
    const { data: saved, error } = await server.rpc('import_song', {
      p_owner: owner,
      p_song_id: id,
      p_origin: input.kind === 'file' ? 'imported' : 'editor',
      p_sheet: {
        title: sheet.title,
        composer: sheet.composer,
        bpm: sheet.bpm,
        time_beats: sheet.timeSignature.beats,
        time_unit: sheet.timeSignature.unit,
        key: sheet.key,
        duration_seconds: sheet.durationSeconds,
      },
      p_charts: charts,
      p_source: { format: source.format, file_name: source.fileName, content: source.content },
      p_replace: !!replace,
    });
    if (error?.code === 'VHLIM') throw new ImportError('limit_reached');
    if (error?.code === 'P0002') throw new ImportError('invalid_song', 'música a regravar não encontrada');
    if (error) throw error;
    return json(201, { status: 'created', song: saved, part: outcome.song.part });
  } catch (error) {
    if (error instanceof ImportError) return fail(error);
    console.error('import-song', error);
    return fail(new ImportError('server'));
  }
});
