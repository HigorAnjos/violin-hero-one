import { describe, expect, it, vi } from 'vitest';
import { createEditor, insertNote, songToSave } from '../game/notation/editor';
import { createSongCache, memorySongStore } from './songCache';
import { edgeSongImporter, fakeSongImporter, ImportError, IMPORT_FUNCTION, saveAndKeep, type ImportClient } from './songImport';

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
