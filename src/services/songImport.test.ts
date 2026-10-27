import { describe, expect, it, vi } from 'vitest';
import { createEditor, insertNote, songToSave } from '../game/notation/editor';
import { createSongCache, memorySongStore } from './songCache';
import { edgeSongImporter, fakeSongImporter, importAndKeep, ImportError, IMPORT_FUNCTION, saveAndKeep, type ImportClient } from './songImport';

const SCALE = songToSave([62, 64, 66, 67, 69, 71, 73, 74].reduce((s, m) => insertNote(s, m), createEditor({ title: 'Escala' })));

function client(invoke: ImportClient['functions']['invoke'], session = true): ImportClient {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: session ? { user: { id: 'u1', is_anonymous: true } } : null }, error: null }),
      signInAnonymously: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'sem rede' } }),
    } as unknown as ImportClient['auth'],
    functions: { invoke },
  };
}

describe('edgeSongImporter', () => {
  it('manda a Song com origin editor para a Edge Function e devolve a gravada', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { song: { ...SCALE, id: 'srv-1' }, hash: 'h1' }, error: null });
    const saved = await edgeSongImporter(client(invoke as never)).saveEditorSong(SCALE);
    expect(invoke).toHaveBeenCalledWith(IMPORT_FUNCTION, { body: { origin: 'editor', song: SCALE } });
    expect(saved.song.id).toBe('srv-1');
    expect(saved.hash).toBe('h1');
    expect(saved.sheet).toMatchObject({ id: 'srv-1', title: 'Escala', origin: 'editor', bpm: 72 });
  });

  it('sem cliente ou sem sessão: offline, sem chamar o servidor', async () => {
    await expect(edgeSongImporter(null).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'offline' });
    const invoke = vi.fn();
    await expect(edgeSongImporter(client(invoke as never, false)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'offline' });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('422 é partitura recusada; outro erro ou resposta torta, erro do servidor', async () => {
    const refused = vi.fn().mockResolvedValue({ data: null, error: { message: 'x', context: { status: 422 } } });
    await expect(edgeSongImporter(client(refused as never)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'invalid' });
    const broken = vi.fn().mockResolvedValue({ data: { song: { nada: 1 }, hash: 'h' }, error: null });
    await expect(edgeSongImporter(client(broken as never)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'server' });
    const noHash = vi.fn().mockResolvedValue({ data: { song: SCALE }, error: null });
    await expect(edgeSongImporter(client(noHash as never)).saveEditorSong(SCALE)).rejects.toBeInstanceOf(ImportError);
  });

  it('a resposta de verdade da função (sheet, levels, song, hash) vira a música salva com a ficha do servidor', async () => {
    const song = { ...SCALE, id: 'srv-2' };
    const sheet = { id: 'srv-2', title: 'Escala', composer: '', bpm: 72, timeSignature: { beats: 4, unit: 4 }, key: 'D major', durationSeconds: 7, origin: 'editor' };
    const invoke = vi.fn().mockResolvedValue({ data: { status: 'created', sheet, levels: ['easy', 'medium', 'hard'], song, hash: 'h2', part: null }, error: null });
    const saved = await edgeSongImporter(client(invoke as never)).saveEditorSong(SCALE);
    expect(saved).toEqual({ sheet, song, hash: 'h2' });
  });

  it('limite (409) e recusa com código: a mensagem em pt-BR do servidor chega à tela', async () => {
    const limit = 'Você chegou ao limite de 50 músicas suas. Apague alguma para importar outra.';
    const invoke = vi.fn().mockResolvedValue({ data: null, error: httpError(409, { error: { code: 'limit_reached', message: limit } }) });
    await expect(edgeSongImporter(client(invoke as never)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'limit', code: 'limit_reached', message: limit });
    const range = vi.fn().mockResolvedValue({ data: null, error: httpError(422, { error: { code: 'out_of_range', message: 'Notas fora da extensão.' } }) });
    await expect(edgeSongImporter(client(range as never)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'invalid', code: 'out_of_range', message: 'Notas fora da extensão.' });
    const down = vi.fn().mockResolvedValue({ data: null, error: httpError(500, { error: { code: 'server', message: 'x' } }) });
    await expect(edgeSongImporter(client(down as never)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'server', message: expect.stringMatching(/rascunho/) });
    const offline = vi.fn().mockResolvedValue({ data: null, error: Object.assign(new Error('Failed to send a request'), { name: 'FunctionsFetchError' }) });
    await expect(edgeSongImporter(client(offline as never)).saveEditorSong(SCALE)).rejects.toMatchObject({ kind: 'offline' });
  });
});

/** Erro como o functions-js entrega quando a função responde fora de 2xx: a Response em `context`. */
const httpError = (status: number, body: unknown) =>
  Object.assign(new Error('Edge Function returned a non-2xx status code'), { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), { status }) });

describe('edgeSongImporter.importFile', () => {
  const chart = { ...SCALE, id: 'srv-3', level: 'easy' as const };
  const sheet = { id: 'srv-3', title: 'Red Apple Rag', composer: 'Tradicional', bpm: 120, timeSignature: { beats: 4, unit: 4 }, key: 'G major', durationSeconds: 64.5, origin: 'imported' };

  it('manda o arquivo (e a parte escolhida) por multipart e devolve o nível gravado e os que existem', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { status: 'created', sheet, levels: ['hard', 'easy'], song: chart, hash: 'h3' }, error: null });
    const result = await edgeSongImporter(client(invoke as never)).importFile(new File(['X:1\nK:G\nG|'], 'red-apple-rag.abc'), 'P2');
    expect(result).toEqual({ status: 'created', saved: { sheet, song: chart, hash: 'h3' }, levels: ['easy', 'hard'] });
    const [name, { body }] = invoke.mock.calls[0];
    expect(name).toBe(IMPORT_FUNCTION);
    expect((body.get('file') as File).name).toBe('red-apple-rag.abc');
    expect(body.get('part')).toBe('P2');
  });

  it('várias partes de violino: devolve a lista para escolher', async () => {
    const parts = [
      { id: 'P1', name: 'Violin I', notes: 10, lowest: 62, highest: 81, fits: true, violin: true },
      { id: 'P2', name: 'Violin II', notes: 9, lowest: 55, highest: 76, fits: true, violin: true },
    ];
    const invoke = vi.fn().mockResolvedValue({ data: { status: 'choose-part', parts }, error: null });
    expect(await edgeSongImporter(client(invoke as never)).importFile(new File(['x'], 'q.musicxml'))).toEqual({ status: 'choose-part', parts });
  });

  it('formato não reconhecido (415) é recusa, com a mensagem do servidor', async () => {
    const message = 'Formato não reconhecido. Envie MusicXML (.musicxml, .xml ou .mxl), MIDI (.mid) ou ABC (.abc).';
    const invoke = vi.fn().mockResolvedValue({ data: null, error: httpError(415, { error: { code: 'unknown_format', message } }) });
    await expect(edgeSongImporter(client(invoke as never)).importFile(new File(['x'], 'a.pdf'))).rejects.toMatchObject({ kind: 'invalid', code: 'unknown_format', message });
  });

  it('importAndKeep guarda no aparelho o nível que veio; o fake pede a parte do "quarteto"', async () => {
    const cache = createSongCache(memorySongStore(), { user: () => 'u1' });
    const importer = fakeSongImporter();
    expect((await importAndKeep(importer, new File(['x'], 'quarteto.musicxml'), undefined, cache)).status).toBe('choose-part');
    const result = await importAndKeep(importer, new File(['x'], 'minha.mid'), 'P1', cache);
    expect(result).toMatchObject({ status: 'created', levels: ['easy'] });
    expect((await cache.find('importada-1', 'easy'))?.sheet).toMatchObject({ title: 'minha', origin: 'imported' });
  });
});

describe('saveAndKeep', () => {
  it('a música salva fica no cache do aparelho, no nível dela', async () => {
    const cache = createSongCache(memorySongStore(), { user: () => 'u1' });
    const importer = fakeSongImporter();
    const saved = await saveAndKeep(importer, SCALE, cache);
    expect(saved.song.id).toBe('escrita-1');
    expect(importer.saved).toHaveLength(1);
    const kept = await cache.find('escrita-1', 'hard');
    expect(kept?.sheet).toMatchObject({ title: 'Escala', origin: 'editor' });
  });

  it('cache cheio ou quebrado não derruba a gravação; falha do servidor sobe', async () => {
    const broken = { remember: vi.fn().mockRejectedValue(new Error('QuotaExceeded')), find: vi.fn(), list: vi.fn() };
    await expect(saveAndKeep(fakeSongImporter(), SCALE, broken)).resolves.toMatchObject({ hash: 'fake-1' });
    await expect(saveAndKeep(fakeSongImporter({ fail: 'server' }), SCALE, null)).rejects.toThrow(/Não foi possível salvar/);
  });
});
