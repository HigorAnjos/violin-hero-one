import { Texture, TextureSource, type Graphics } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme, getTheme, type Theme } from '../../assets/styles/themes';
import { noteLabel } from './look';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { scheduleNotes } from '../engine';
import type { EngineNote, Judgment } from '../engine/types';
import { FIXED_SONGS } from '../notation/songs';
import { LEAD_SECONDS } from './layout';
import { TrackScene, type JudgmentEvent, type TextureBaker } from './scene';

function fakeBaker() {
  const generateTexture = vi.fn(() => new Texture({ source: new TextureSource({ width: 8, height: 8 }) }));
  return { baker: { resolution: 1, generateTexture } as unknown as TextureBaker, generateTexture };
}

const START = 10;
const notes: EngineNote[] = scheduleNotes(FIXED_SONGS[0].song, START);

function judgment(note: EngineNote, judgment: Judgment, issue: JudgmentEvent['issue'] = null): JudgmentEvent {
  return {
    type: 'judgment',
    index: note.index,
    noteIndex: note.noteIndex,
    measure: note.measure,
    string: note.string,
    midi: note.midi,
    judgment,
    issue,
    offsetMs: 0,
    cents: 0,
    playedMidi: null,
    points: 0,
    state: { score: 0, combo: 3, maxCombo: 3, multiplier: 1, energy: 0.5, accuracy: 100, judged: 1, total: notes.length },
  };
}

function scene(theme = cadernoTheme) {
  const { baker, generateTexture } = fakeBaker();
  const s = new TrackScene(baker, { theme, notes, reducedMotion: false });
  s.layout(640, 550);
  return { s, generateTexture };
}

describe('TrackScene', () => {
  it.each([
    ['Caderno', cadernoTheme],
    ['Palco', palcoTheme],
  ])('%s: assa as texturas uma vez; resize não refaz nenhuma', (_name, theme) => {
    const { s, generateTexture } = scene(theme);
    const baked = generateTexture.mock.calls.length;
    expect(baked).toBe(s.bakedTextures().length);
    s.layout(440, 272);
    s.layout(1280, 720);
    s.update(START + 1);
    expect(generateTexture.mock.calls.length).toBe(baked);
  });

  it('nada na pista antes de a primeira nota chegar ao topo', () => {
    const { s } = scene();
    s.update(START - LEAD_SECONDS - 1);
    expect(s.visibleNotes()).toBe(0);
  });

  it('mostra as notas que estão a caminho', () => {
    const { s } = scene();
    s.update(START - 0.5);
    expect(s.visibleNotes()).toBeGreaterThan(0);
  });

  it('a nota acertada some da pista; a errada continua, apagada', () => {
    const { s } = scene();
    const now = notes[0].time + 0.02;
    s.update(now);
    const before = s.visibleNotes();
    s.judge(judgment(notes[0], 'perfect'), now);
    s.update(now);
    expect(s.visibleNotes()).toBe(before - 1);

    s.judge(judgment(notes[1], 'miss', 'not-played'), notes[1].time + 0.3);
    s.update(notes[1].time + 0.3);
    expect(Math.min(...s.visibleNoteAlphas())).toBeLessThan(0.5);
  });

  it('feedback aparece no julgamento e some depois de um tempo', () => {
    const { s } = scene();
    s.update(START);
    expect(s.feedbackVisible()).toBe(false);
    s.judge(judgment(notes[0], 'great', 'late'), START);
    s.update(START + 0.1);
    expect(s.feedbackVisible()).toBe(true);
    s.update(START + 2);
    expect(s.feedbackVisible()).toBe(false);
  });

  it('setNotes: a volta seguinte entra na pista, e as notas que ficam guardam o acerto', () => {
    const { s } = scene();
    const now = notes[0].time + 0.02;
    s.judge(judgment(notes[0], 'perfect'), now);
    const lap = notes.slice(0, 4);
    const next = lap.map((n, i) => ({ ...n, index: 4 + i, time: n.time + 4 }));
    s.setNotes([...lap, ...next]);
    s.update(now);
    const fresh = scene().s;
    fresh.setNotes([...lap, ...next]);
    fresh.update(now);
    expect(s.visibleNotes()).toBe(fresh.visibleNotes() - 1);
    s.update(next[0].time - 0.5);
    expect(s.visibleNotes()).toBeGreaterThan(0);
    s.setNotes(lap);
    s.update(next[0].time - 0.5);
    expect(s.visibleNotes()).toBe(0);
  });

  it('setNotes com mais notas na janela do que o pool aumenta o pool', () => {
    const { s } = scene();
    const dense = Array.from({ length: 200 }, (_, i) => ({ ...notes[0], index: i, time: START + i * 0.01 }));
    s.setNotes(dense);
    s.update(START);
    expect(s.visibleNotes()).toBeGreaterThan(100);
  });

  it('a 60 e a 120 fps, no mesmo instante as notas estão no mesmo lugar (movimento por tempo, não por quadro)', () => {
    const frames = (fps: number) => {
      const { s } = scene();
      const seen: string[][] = [];
      // da entrada às primeiras notas tocadas, com um acerto e um erro no meio; foto a cada 1/60 s
      for (let f = 0; f <= 6 * fps; f++) {
        const now = START - LEAD_SECONDS + f / fps;
        if (f === 3 * fps) {
          s.judge(judgment(notes[0], 'perfect'), now);
          s.judge(judgment(notes[1], 'miss', 'not-played'), now);
        }
        s.update(now);
        if (f % (fps / 60) === 0) seen.push(s.visibleChips());
      }
      return seen;
    };
    const at60 = frames(60);
    expect(at60).toHaveLength(6 * 60 + 1);
    expect(at60.some((chips) => chips.length > 0)).toBe(true);
    expect(frames(120)).toEqual(at60);
  });

  it('ignora julgamento de nota que não existe', () => {
    const { s } = scene();
    expect(() => s.judge({ ...judgment(notes[0], 'perfect'), index: 9999 })).not.toThrow();
  });

  it('destroy libera as texturas assadas', () => {
    const { s } = scene();
    const baked = s.bakedTextures();
    s.destroy();
    expect(baked.every((t) => t.destroyed)).toBe(true);
  });
});

/** As 4 primeiras texturas assadas são as notas G D A E: largura da arte e quantos traços ela tem. */
function gems(theme: Theme, options: { patterns?: boolean } = {}) {
  const drawn: { width: number; instructions: number }[] = [];
  const generateTexture = vi.fn(({ target }: { target: Graphics }) => {
    // Só as Graphics: o texto não se mede no jsdom
    if (drawn.length < 4) drawn.push({ width: target.getLocalBounds().width, instructions: target.context.instructions.length });
    return new Texture({ source: new TextureSource({ width: 8, height: 8 }) });
  });
  new TrackScene({ resolution: 1, generateTexture } as unknown as TextureBaker, { theme, notes, reducedMotion: false, ...options });
  return drawn.slice(0, 4);
}

describe('TrackScene: especiais e acessibilidade', () => {
  it('Neon: halo em volta da nota (a arte passa do tamanho da nota); Caderno e 8-Bits sem halo', () => {
    const plain = gems(cadernoTheme)[0].width;
    expect(gems(getTheme('8-bits'))[0].width).toBeCloseTo(plain, 0);
    expect(gems(getTheme('neon'))[0].width).toBeGreaterThan(plain * 1.2);
  });

  it('modo daltônico: G lisa e D, A, E com padrão próprio por cima da cor', () => {
    const off = gems(cadernoTheme);
    const on = gems(cadernoTheme, { patterns: true });
    expect(on[0].instructions).toBe(off[0].instructions);
    for (const i of [1, 2, 3]) expect(on[i].instructions).toBeGreaterThan(off[i].instructions);
  });

  it('nome das notas: aparece em cima de cada nota só quando ligado', () => {
    const { baker } = fakeBaker();
    const off = new TrackScene(baker, { theme: cadernoTheme, notes, reducedMotion: false });
    const on = new TrackScene(baker, { theme: cadernoTheme, notes, reducedMotion: false, noteNames: true });
    for (const s of [off, on]) {
      s.layout(640, 550);
      s.update(START + 0.5);
    }
    expect(on.visibleNotes()).toBeGreaterThan(0);
    expect(on.visibleNames()).toBe(on.visibleNotes());
    expect(off.visibleNames()).toBe(0);
  });

  it('nomes assados uma vez por nome e liberados no destroy', () => {
    const { baker } = fakeBaker();
    const s = new TrackScene(baker, { theme: cadernoTheme, notes, reducedMotion: false, noteNames: true });
    const names = new Set(notes.map((n) => noteLabel(n.midi)));
    expect(s.bakedTextures().length).toBe(new TrackScene(fakeBaker().baker, { theme: cadernoTheme, notes, reducedMotion: false }).bakedTextures().length + names.size);
    const baked = s.bakedTextures();
    s.destroy();
    expect(baked.every((t) => t.destroyed)).toBe(true);
  });
});
