import { Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { scheduleNotes } from '../engine';
import type { EngineNote, Judgment } from '../engine/types';
import { FIXED_SONGS } from '../notation/songs';
import type { JudgmentEvent } from './scene';
import { steadyClock } from './sheetLayout';
import { FLOOR_LENGTH, LEAD_SECONDS_3D, STRING_HEIGHTS, casaOf, strings3dLayout } from './strings3dLayout';
import { Strings3DScene, type LabelBaker } from './strings3dScene';

const START = 10;
const song = FIXED_SONGS[0].song;
// Notas curtas (sem "segure"); o teste do segure alonga uma
const notes: EngineNote[] = scheduleNotes(song, START).map((n) => ({ ...n, duration: 0.3 }));
const hex = (theme: typeof cadernoTheme, letter: 'G' | 'D' | 'A' | 'E') => parseInt(theme.game.strings[letter].main.slice(1), 16);

function fakeBaker() {
  const baked = () => ({ texture: new Texture(), aspect: 1.5 });
  const baker = {
    text: vi.fn<LabelBaker['text']>(baked),
    box: vi.fn<LabelBaker['box']>(baked),
    frame: vi.fn(baked),
  } satisfies LabelBaker;
  const calls = () => baker.text.mock.calls.length + baker.box.mock.calls.length + baker.frame.mock.calls.length;
  return { baker, calls };
}

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

function make(options: Partial<ConstructorParameters<typeof Strings3DScene>[1]> = {}) {
  const { baker, calls } = fakeBaker();
  const s = new Strings3DScene(baker, { theme: cadernoTheme, notes, reducedMotion: false, ...options });
  s.layout(1280, 550);
  return { s, baker, calls };
}

describe('Strings3DScene', () => {
  it.each([
    ['Caderno', cadernoTheme],
    ['Palco', palcoTheme],
  ])('%s: cada corda com a cor do tema e a própria letra', (_name, theme) => {
    const { s, baker } = make({ theme });
    expect(s.stringLooks().map((l) => l.color)).toEqual([hex(theme, 'G'), hex(theme, 'D'), hex(theme, 'A'), hex(theme, 'E')]);
    const letters = baker.text.mock.calls.map(([text]) => text);
    expect(letters.slice(0, 4)).toEqual(['G', 'D', 'A', 'E']);
    expect(new Set(s.stringLooks().map((l) => l.letter)).size).toBe(4);
  });

  it('assa as texturas uma vez: resize e quadros não refazem nenhuma', () => {
    const { s, calls } = make();
    const baked = calls();
    expect(baked).toBe(s.bakedTextures().length);
    s.layout(844, 272);
    s.layout(1280, 550);
    s.update(START + 1);
    s.update(START + 1.5);
    expect(calls()).toBe(baked);
  });

  it('caixa da nota com a cor da corda dela e o dedo (uma por corda × dedo)', () => {
    const { baker } = make();
    const boxes = baker.box.mock.calls;
    expect(boxes).toHaveLength(20);
    expect(boxes.map(([text]) => text).slice(0, 5)).toEqual(['0', '1', '2', '3', '4']);
    expect(boxes[0][1]).toBe(hex(cadernoTheme, 'G'));
    expect(boxes[15][1]).toBe(hex(cadernoTheme, 'E'));
  });

  it('nada no chão antes de a primeira nota chegar ao fundo', () => {
    const { s } = make();
    s.update(START - LEAD_SECONDS_3D - 1);
    expect(s.visibleNotes()).toBe(0);
    expect(s.highlightedColumn()).toBeNull();
  });

  it('a nota vem do fundo pela coluna da casa, na altura da corda, e encosta na corda na hora', () => {
    const { s } = make();
    const first = notes[0];
    const l = strings3dLayout(1280, 550);
    s.update(first.time - LEAD_SECONDS_3D / 2);
    const coming = s.visibleBoxes()[0];
    expect(coming.z).toBeCloseTo(-FLOOR_LENGTH / 2);
    expect(coming.x).toBeCloseTo(l.columnX[casaOf(first)]);
    expect(coming.y).toBe(STRING_HEIGHTS[first.string]);
    s.update(first.time);
    expect(s.visibleBoxes()[0].z).toBe(0);
  });

  it('a coluna da próxima nota acende na cor da corda dela', () => {
    const { s } = make();
    s.update(notes[0].time - 0.5);
    const l = strings3dLayout(1280, 550);
    expect(s.highlightedColumn()).toEqual({ x: l.columnX[casaOf(notes[0])], color: hex(cadernoTheme, (['G', 'D', 'A', 'E'] as const)[notes[0].string]) });
  });

  it('a nota acertada some; a errada fica na corda, apagada, e depois some', () => {
    const { s } = make();
    const now = notes[0].time + 0.02;
    s.update(now);
    const before = s.visibleNotes();
    s.judge(judgment(notes[0], 'perfect'), now);
    s.update(now);
    expect(s.visibleNotes()).toBe(before - 1);
    expect(s.hitShown(notes[0].string).frame).toBe(true);

    const missAt = notes[1].time + 0.2;
    s.judge(judgment(notes[1], 'miss', 'not-played'), missAt);
    s.update(missAt + 0.1);
    const missed = s.visibleBoxes().find((b) => b.z === 0 && b.opacity < 0.5);
    expect(missed).toBeDefined();
    s.update(missAt + 1);
    expect(s.visibleBoxes().some((b) => b.opacity < 0.5 && b.z === 0)).toBe(false);
  });

  it('nota longa acertada fica na corda até o fim do segure, com a cauda no chão', () => {
    const held = notes.map((n, i) => (i === 0 ? { ...n, duration: 1.5 } : n));
    const { s } = make({ notes: held });
    s.judge(judgment(held[0], 'perfect'), held[0].time);
    s.update(held[0].time + 0.5);
    expect(s.visibleBoxes().some((b) => b.z === 0 && b.y === STRING_HEIGHTS[held[0].string] && b.opacity === 1)).toBe(true);
    expect(s.heldNotes()).toBe(1);
    s.update(held[0].time + 1.6);
    expect(s.heldNotes()).toBe(0);
  });

  it('reduzir movimento: o contorno do acerto aparece, sem halo crescendo', () => {
    const { s } = make({ reducedMotion: true });
    s.judge(judgment(notes[0], 'great'), notes[0].time);
    s.update(notes[0].time + 0.1);
    expect(s.hitShown(notes[0].string)).toEqual({ frame: true, glow: false });
    const moving = make().s;
    moving.judge(judgment(notes[0], 'great'), notes[0].time);
    moving.update(notes[0].time + 0.1);
    expect(moving.hitShown(notes[0].string)).toEqual({ frame: true, glow: true });
  });

  it('com o relógio, linhas dos tempos e barras de compasso no chão; sem ele, nenhuma', () => {
    const bars = song.measures.reduce<number[]>((acc, _m, i) => [...acc, i === 0 ? 0 : acc[i - 1] + song.measures[i - 1].beats], []);
    const { s } = make({ clock: steadyClock(START, song.bpm), bars });
    s.update(START);
    const grid = s.gridLines();
    expect(grid.bars).toBeGreaterThan(0);
    expect(grid.beats).toBeGreaterThan(grid.bars);
    const bare = make().s;
    bare.update(START);
    expect(bare.gridLines()).toEqual({ beats: 0, bars: 0 });
  });

  it('setNotes: a volta seguinte entra, e as notas que ficam guardam o acerto', () => {
    const { s } = make();
    const now = notes[0].time + 0.02;
    s.judge(judgment(notes[0], 'perfect'), now);
    const lap = notes.slice(0, 4);
    const next = lap.map((n, i) => ({ ...n, index: 4 + i, time: n.time + 4 }));
    s.setNotes([...lap, ...next]);
    s.update(now);
    const fresh = make().s;
    fresh.setNotes([...lap, ...next]);
    fresh.update(now);
    expect(s.visibleNotes()).toBe(fresh.visibleNotes() - 1);
    s.update(next[0].time - 0.5);
    expect(s.visibleNotes()).toBeGreaterThan(0);
    // Sem a volta seguinte, depois que a última da volta passou, o chão fica vazio
    s.setNotes(lap);
    s.update(next[0].time + 2);
    expect(s.visibleNotes()).toBe(0);
  });

  it('setNotes com mais notas na janela do que o pool aumenta o pool', () => {
    const { s } = make();
    const dense = Array.from({ length: 120 }, (_, i) => ({ ...notes[0], index: i, time: START + i * 0.01 }));
    s.setNotes(dense);
    s.update(START);
    expect(s.visibleNotes()).toBeGreaterThan(60);
  });

  it('ignora julgamento de nota que não existe', () => {
    const { s } = make();
    expect(() => s.judge({ ...judgment(notes[0], 'perfect'), index: 9999 })).not.toThrow();
  });

  it('destroy libera as texturas assadas', () => {
    const { s } = make();
    const baked = s.bakedTextures();
    const disposed = baked.map((t) => vi.spyOn(t, 'dispose'));
    s.destroy();
    expect(disposed.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
