import { describe, it, expect, vi } from 'vitest';
import { importSong, ImportSongError, type ImportClient } from './importSong';
import type { SessionState } from './session';

const SESSION: SessionState = { status: 'signed-in', userId: 'u1', anonymous: true };

const saved = {
  id: 'abc-123',
  title: 'Red Apple Rag',
  composer: 'Tradicional',
  bpm: '120.00',
  time_beats: 4,
  time_unit: 4,
  key: 'G major',
  duration_seconds: '74.00',
  origin: 'imported',
  levels: ['easy', 'medium', 'hard'],
};

function clientWith(reply: { data?: unknown; error?: unknown }) {
  const invoke = vi.fn().mockResolvedValue({ data: reply.data ?? null, error: reply.error ?? null });
  const client = { auth: { getSession: vi.fn(), signInAnonymously: vi.fn() }, functions: { invoke } } as unknown as ImportClient;
  return { client, invoke };
}

/** Erro como o functions-js entrega quando a função responde fora de 2xx: a Response em `context`. */
const httpError = (status: number, body: unknown) =>
  Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    name: 'FunctionsHttpError',
    context: new Response(JSON.stringify(body), { status }),
  });

describe('importSong', () => {
  it('manda o arquivo (e a parte escolhida) por multipart e devolve a música criada como entrada da estante', async () => {
    const { client, invoke } = clientWith({ data: { status: 'created', song: saved } });
    const file = new File(['X:1\nK:G\nG|'], 'red-apple-rag.abc');
    const result = await importSong(client, SESSION, { file, part: 'P2' });
    expect(result).toEqual({
      status: 'created',
      song: {
        id: 'abc-123',
        title: 'Red Apple Rag',
        composer: 'Tradicional',
        bpm: 120,
        timeSignature: { beats: 4, unit: 4 },
        key: 'G major',
        durationSeconds: 74,
        origin: 'imported',
        levels: ['easy', 'medium', 'hard'],
      },
    });
    const [name, { body }] = invoke.mock.calls[0];
    expect(name).toBe('import-song');
    expect(body).toBeInstanceOf(FormData);
    expect((body.get('file') as File).name).toBe('red-apple-rag.abc');
    expect(body.get('part')).toBe('P2');
  });

  it('várias partes de violino: devolve a lista para o jogador escolher', async () => {
    const parts = [
      { id: 'P1', name: 'Violin I', notes: 10, lowest: 62, highest: 81, fits: true, violin: true },
      { id: 'P2', name: 'Violin II', notes: 9, lowest: 55, highest: 76, fits: true, violin: true },
    ];
    const { client } = clientWith({ data: { status: 'choose-part', parts } });
    expect(await importSong(client, SESSION, { file: new File(['x'], 'q.musicxml') })).toEqual({ status: 'choose-part', parts });
  });

  it('melodia do editor vai como JSON, com replace para salvar de novo a mesma', async () => {
    const { client, invoke } = clientWith({ data: { status: 'created', song: { ...saved, origin: 'editor' } } });
    const song = { title: 'Minha', measures: [] };
    await importSong(client, SESSION, { song });
    await importSong(client, SESSION, { song, replace: 'abc-123' });
    expect(invoke.mock.calls.map((c) => c[1].body)).toEqual([{ song }, { song, replace: 'abc-123' }]);
  });

  it('erro da função chega com o código e a mensagem em pt-BR do servidor', async () => {
    const message = 'Você chegou ao limite de 50 músicas suas. Apague alguma para importar outra.';
    const { client } = clientWith({ error: httpError(409, { error: { code: 'limit_reached', message } }) });
    const error = await importSong(client, SESSION, { file: new File(['x'], 'a.abc') }).catch((e) => e);
    expect(error).toBeInstanceOf(ImportSongError);
    expect(error).toMatchObject({ code: 'limit_reached', message });
  });

  it('sem rede ou sem sessão: offline; resposta estranha: servidor', async () => {
    const offline = clientWith({ error: Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError' }) });
    await expect(importSong(offline.client, SESSION, { file: new File(['x'], 'a.abc') })).rejects.toMatchObject({ code: 'offline' });
    await expect(importSong(null, SESSION, { song: {} })).rejects.toMatchObject({ code: 'offline' });
    await expect(importSong(offline.client, { status: 'offline' }, { song: {} })).rejects.toMatchObject({ code: 'offline' });
    const broken = clientWith({ error: httpError(502, 'gateway') });
    await expect(importSong(broken.client, SESSION, { song: {} })).rejects.toMatchObject({ code: 'server' });
    const empty = clientWith({ data: {} });
    await expect(importSong(empty.client, SESSION, { song: {} })).rejects.toMatchObject({ code: 'server' });
  });
});
