import { describe, expect, it } from 'vitest';
import { FIXED_SONGS } from '../game/notation/songs';
import { gameRoute, readPlayState } from './play';
import { needsMicrophone, ROUTES } from './routes';

describe('estado da partida', () => {
  it('cada modo tem a sua tela, todas com microfone', () => {
    expect(gameRoute('Arcade')).toBe(ROUTES.game);
    expect(gameRoute('Partitura')).toBe(ROUTES.sheet);
    expect(gameRoute('Prática')).toBe(ROUTES.practice);
    expect(gameRoute('Cordas 3D')).toBe('/jogo/3d');
    expect(gameRoute(undefined)).toBe(ROUTES.strings3d);
    for (const path of [ROUTES.sheet, ROUTES.practice, ROUTES.strings3d]) expect(needsMicrophone(path)).toBe(true);
  });

  it('sem estado, a primeira fixa em Cordas 3D; modo desconhecido vira Cordas 3D', () => {
    expect(readPlayState(null)).toMatchObject({ song: FIXED_SONGS[0].song, mode: 'Cordas 3D' });
    expect(readPlayState({ mode: 'Guitarra' }).mode).toBe('Cordas 3D');
    expect(readPlayState({ mode: 'Partitura' }).mode).toBe('Partitura');
  });

  it('mantém a prática que veio na navegação', () => {
    const practice = { loop: { startMeasure: 2, endMeasure: 4 }, speed: 0.8 };
    expect(readPlayState({ mode: 'Prática', practice }).practice).toEqual(practice);
  });
});
