import { describe, expect, it } from 'vitest';
import { levelFromSlug, loadingUrl, modeFromSlug, modesUrl, parseSongChoice, songsUrl } from './choice';
import { needsMicrophone } from './routes';

const search = (url: string) => new URL(url, 'http://x').searchParams;

describe('escolha na URL', () => {
  it('ida e volta de modo, música e nível, em português', () => {
    const url = loadingUrl({ mode: 'Partitura', songId: 'greensleeves', level: 'medium' });
    expect(url).toBe('/tocar/carregando?modo=partitura&musica=greensleeves&nivel=medio');
    expect(parseSongChoice(search(url))).toEqual({ mode: 'Partitura', songId: 'greensleeves', level: 'medium' });
  });

  it('sem música não há escolha; modo e nível estranhos viram Arcade e Fácil', () => {
    expect(parseSongChoice(search('/tocar/carregando?modo=arcade'))).toBeNull();
    expect(parseSongChoice(search('/x?musica=a&modo=guitarra&nivel=expert'))).toEqual({ songId: 'a', mode: 'Arcade', level: 'easy' });
    expect(modeFromSlug('pratica')).toBe('Prática');
    expect(levelFromSlug('dificil')).toBe('hard');
  });

  it('endereços das telas de escolha, todas sem microfone', () => {
    expect(modesUrl()).toBe('/tocar');
    expect(modesUrl('Partitura')).toBe('/tocar?modo=partitura');
    expect(songsUrl('Arcade')).toBe('/tocar/musica?modo=arcade');
    expect(songsUrl('Arcade', 'aleluia')).toBe('/tocar/musica?modo=arcade&musica=aleluia');
    for (const path of ['/tocar', '/tocar/musica', '/tocar/carregando', '/biblioteca']) expect(needsMicrophone(path)).toBe(false);
  });
});
