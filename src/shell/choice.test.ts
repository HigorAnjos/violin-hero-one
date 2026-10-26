import { describe, expect, it } from 'vitest';
import { isReadyMode, levelFromSlug, loadingUrl, modeFromSlug, modesUrl, parseSongChoice, READY_MODES, readyMode, songsUrl } from './choice';
import { GAME_MODES } from './play';
import { needsMicrophone } from './routes';

const search = (url: string) => new URL(url, 'http://x').searchParams;

describe('escolha na URL', () => {
  it('ida e volta de modo, música e nível, em português', () => {
    const url = loadingUrl({ mode: 'Arcade', songId: 'greensleeves', level: 'medium' });
    expect(url).toBe('/tocar/carregando?modo=arcade&musica=greensleeves&nivel=medio');
    expect(parseSongChoice(search(url))).toEqual({ mode: 'Arcade', songId: 'greensleeves', level: 'medium' });
    expect(loadingUrl({ mode: 'Partitura', songId: 'a', level: 'easy' })).toBe('/tocar/carregando?modo=partitura&musica=a&nivel=facil');
  });

  it('os quatro modos têm tela e passam pela URL; sem modo, Arcade', () => {
    expect(READY_MODES).toEqual(GAME_MODES);
    for (const mode of GAME_MODES) {
      expect(isReadyMode(mode)).toBe(true);
      expect(parseSongChoice(search(loadingUrl({ mode, songId: 'a', level: 'easy' })))?.mode).toBe(mode);
    }
    expect(readyMode(null)).toBe('Arcade');
    expect(modeFromSlug('cordas-3d')).toBe('Cordas 3D');
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
    expect(modesUrl(undefined, 'aleluia')).toBe('/tocar?musica=aleluia');
    expect(modesUrl('Cordas 3D', 'aleluia')).toBe('/tocar?modo=cordas-3d&musica=aleluia');
    expect(songsUrl('Arcade')).toBe('/tocar/musica?modo=arcade');
    expect(songsUrl('Arcade', 'aleluia')).toBe('/tocar/musica?modo=arcade&musica=aleluia');
    for (const path of ['/tocar', '/tocar/musica', '/tocar/carregando', '/biblioteca']) expect(needsMicrophone(path)).toBe(false);
  });
});
