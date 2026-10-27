import { describe, expect, it, vi } from 'vitest';
import { deleteOwnSong, type SongsClient } from './songs';
import { createSongCache, memorySongStore } from './songCache';
import { fakeChart } from './testing';
import { editorSheet } from './songImport';

describe('apagar música própria', () => {
  function client(data: unknown[], error: unknown = null) {
    const select = vi.fn(async () => ({data,error}));
    const neq = vi.fn(() => ({select}));
    const eq = vi.fn(() => ({neq}));
    const remove = vi.fn(() => ({eq}));
    const from = vi.fn(() => ({delete:remove}));
    return {db:{auth:{getSession:async()=>({data:{session:{user:{id:'dono',is_anonymous:true}}},error:null})},from} as unknown as SongsClient,from,eq,neq};
  }
  it('filtra pelo id e exclui catálogo do pedido', async () => {
    const fake=client([{id:'minha'}]);
    await deleteOwnSong('minha',fake.db);
    expect(fake.from).toHaveBeenCalledWith('songs');
    expect(fake.eq).toHaveBeenCalledWith('id','minha');
    expect(fake.neq).toHaveBeenCalledWith('origin','catalog');
  });
  it('não informa sucesso quando RLS não devolve linha apagada', async () => {
    await expect(deleteOwnSong('outra',client([]).db)).rejects.toThrow('não está disponível');
  });
  it('falha de rede não vira sucesso', async () => {
    await expect(deleteOwnSong('minha',client([],new Error('rede')).db)).rejects.toThrow('Tente de novo com internet');
  });
  it('remove todos os níveis do aparelho apenas do usuário atual', async () => {
    let userId='a';
    const cache=createSongCache(memorySongStore(),{user:()=>userId});
    const song=fakeChart('minha','easy');
    const loaded={song,sheet:editorSheet(song,'imported'),hash:'abc'};
    await cache.remember(loaded,'easy'); await cache.remember(loaded,'medium');
    userId='b'; await cache.remember(loaded,'easy');
    userId='a'; await cache.forget?.('minha');
    expect(await cache.list()).toEqual([]);
    userId='b'; expect(await cache.list()).toHaveLength(1);
  });
});
