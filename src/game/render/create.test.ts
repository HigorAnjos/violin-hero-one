import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme, getTheme } from '../../assets/styles/themes';
import type { Song } from '../notation/song';

const made: { init: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[] = [];

// Sem WebGL no jsdom: o Application finge o init e guarda as opções e o destroy
vi.mock('pixi.js', async (importOriginal) => {
  const pixi = await importOriginal<typeof import('pixi.js')>();
  class Application {
    canvas = document.createElement('canvas');
    stage = new pixi.Container();
    renderer = { resolution: 1, generateTexture: () => pixi.Texture.WHITE };
    init = vi.fn(async () => undefined);
    destroy = vi.fn();
    constructor() {
      made.push(this);
    }
  }
  return { ...pixi, Application };
});

const { createSheet } = await import('./sheet');
const { createTrack } = await import('./track');
const { createStrings3D } = await import('./strings3d');

describe('criar a faixa e a pista', () => {
  it.each(['faixa', 'pista', 'cordas'] as const)('%s carrega dígitos e letras antes de montar o canvas 8-Bits', async (mode) => {
    const theme = getTheme('8-bits');
    const load = vi.fn().mockResolvedValue([]);
    const previous = Object.getOwnPropertyDescriptor(document, 'fonts');
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } });
    made.length = 0;
    try {
      const host = document.createElement('div');
      const options = { theme, width: 300, height: 120 };
      // A cena não precisa de WebGL para provar o carregamento que a precede.
      const create = mode === 'faixa'
        ? createSheet(host, { ...options, song: { measures: null } as unknown as Song, clock: { segments: () => [] } })
        : (mode === 'pista' ? createTrack : createStrings3D)(host, { ...options, notes: [] });
      await create.catch(() => undefined);
      const size = mode === 'faixa' ? 24 : 64;
      expect(load).toHaveBeenCalledWith(`800 ${size}px ${theme.fonts.display}`, ' 0123456789ºª');
      expect(load.mock.invocationCallOrder[0]).toBeLessThan(made[0].init.mock.invocationCallOrder[0]);
    } finally {
      if (previous) Object.defineProperty(document, 'fonts', previous);
      else Reflect.deleteProperty(document, 'fonts');
    }
  });

  it('a faixa que falha ao montar a cena libera o contexto WebGL e tira o canvas', async () => {
    made.length = 0;
    const host = document.createElement('div');
    const broken = { measures: null } as unknown as Song;
    await expect(createSheet(host, { theme: cadernoTheme, song: broken, clock: { segments: () => [] }, width: 300, height: 120 })).rejects.toThrow();
    expect(made).toHaveLength(1);
    expect(made[0].destroy).toHaveBeenCalledWith({ removeView: true }, expect.objectContaining({ children: true }));
  });

  it('a pista que falha ao montar a cena também', async () => {
    made.length = 0;
    const broken = null as unknown as [];
    await expect(createTrack(document.createElement('div'), { theme: cadernoTheme, notes: broken, width: 300, height: 120 })).rejects.toThrow();
    expect(made[0].destroy).toHaveBeenCalled();
  });

  it.each([
    [1, true],
    [2, false],
    [3, false],
  ])('dpr %d: antialias %s (MSAA só em tela comum)', async (dpr, antialias) => {
    made.length = 0;
    vi.stubGlobal('devicePixelRatio', dpr);
    const host = document.createElement('div');
    await createSheet(host, { theme: cadernoTheme, song: (await import('../notation/songs')).FIXED_SONGS[0].song, clock: { segments: () => [] }, width: 300, height: 120 }).catch(() => undefined);
    await createTrack(host, { theme: cadernoTheme, notes: [], width: 300, height: 120 }).catch(() => undefined);
    expect(made).toHaveLength(2);
    for (const app of made) expect(app.init).toHaveBeenCalledWith(expect.objectContaining({ antialias, resolution: Math.min(dpr, 2) }));
    vi.unstubAllGlobals();
  });
});
