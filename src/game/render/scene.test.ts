import { Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
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
