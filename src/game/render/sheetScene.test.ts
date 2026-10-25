import { Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { ODE } from '../engine/testing';
import type { Issue, Judgment } from '../engine/types';
import type { TextureBaker, JudgmentEvent } from './scene';
import { PASSED_ALPHA, sheetLayout, steadyClock, type BeatSegment, type SheetClock } from './sheetLayout';
import { SheetScene } from './sheetScene';

function fakeBaker() {
  const generateTexture = vi.fn(() => new Texture({ source: new TextureSource({ width: 8, height: 8 }) }));
  return { baker: { resolution: 1, generateTexture } as unknown as TextureBaker, generateTexture };
}

// Ode, 4 compassos de 4 tempos a 100 bpm (0,6 s por tempo), primeiro tempo às 10 s
const START = 10;
const SPB = 0.6;
const W = 1198;
const H = 280;

function judgment(noteIndex: number, judgment: Judgment, issue: Issue | null = null): JudgmentEvent {
  return {
    type: 'judgment',
    index: noteIndex,
    noteIndex,
    measure: 0,
    string: 3,
    midi: 76,
    judgment,
    issue,
    offsetMs: 0,
    cents: 0,
    playedMidi: null,
    points: 0,
    state: { score: 0, combo: 0, maxCombo: 0, multiplier: 1, energy: 0.5, accuracy: 100, judged: 1, total: 15 },
  };
}

function scene(clock: SheetClock = steadyClock(START, 100), theme = cadernoTheme) {
  const { baker, generateTexture } = fakeBaker();
  const s = new SheetScene(baker, { theme, song: ODE, clock, reducedMotion: false });
  s.layout(W, H);
  return { s, generateTexture };
}

const needleX = sheetLayout(W, H, 2).needleX;

describe('SheetScene', () => {
  it.each([
    ['Caderno', cadernoTheme],
    ['Palco', palcoTheme],
  ])('%s: assa as texturas uma vez; resize e quadros não refazem nenhuma', (_name, theme) => {
    const { s, generateTexture } = scene(steadyClock(START, 100), theme);
    const baked = generateTexture.mock.calls.length;
    expect(baked).toBe(s.bakedTextures().length);
    s.layout(1200, 112);
    s.layout(640, 200);
    s.update(START + 3);
    s.judge(judgment(0, 'miss', 'not-played'), START + 0.3);
    s.update(START + 3.1);
    expect(generateTexture.mock.calls.length).toBe(baked);
  });

  it('a nota da vez fica sob a agulha e as próximas à direita, no espaço da escrita', () => {
    const { s } = scene();
    s.update(START);
    const [first] = s.noteView(0);
    expect(first.x).toBeCloseTo(needleX);
    const [second] = s.noteView(1);
    expect(second.x - first.x).toBeCloseTo(sheetLayout(W, H, 2).pxPerBeat);
    s.update(START + SPB);
    expect(s.noteView(1)[0].x).toBeCloseTo(needleX);
  });

  it('antes da música começar mostra as primeiras notas à frente da agulha', () => {
    const { s } = scene();
    s.update(START - 2);
    expect(s.visibleNotes().length).toBeGreaterThan(0);
    expect(s.noteView(0)[0].x).toBeGreaterThan(needleX);
  });

  it('nota que passou apaga; a acertada continua acesa; a errada leva a marca', () => {
    const { s } = scene();
    s.judge(judgment(1, 'perfect'), START + SPB);
    s.judge(judgment(2, 'miss', 'not-played'), START + 2 * SPB + 0.25);
    s.update(START + 3.2 * SPB);
    expect(s.noteView(1)[0]).toMatchObject({ alpha: 1, marked: false });
    expect(s.noteView(2)[0]).toMatchObject({ alpha: PASSED_ALPHA, marked: true });
    expect(s.noteView(3)[0].alpha).toBe(1);
  });

  it('acerto com motivo (tarde, baixo) também marca a nota', () => {
    const { s } = scene();
    s.judge(judgment(0, 'good', 'late'), START + 0.2);
    s.update(START + 0.3);
    expect(s.noteView(0)[0].marked).toBe(true);
  });

  it('faixa da duração aparece enquanto a nota soa', () => {
    const { s } = scene();
    s.update(START - 1);
    expect(s.holdVisible()).toBe(false);
    s.update(START + 0.3);
    expect(s.holdVisible()).toBe(true);
  });

  it('laço A–B: depois de B vem A, e a volta nova nasce sem as marcas da anterior', () => {
    // laço nos compassos 1–2 (tempos 4 a 12): salto no tempo 12
    const jump = START + 12 * SPB;
    const segments: BeatSegment[] = [
      { time: START, beat: 0, spb: SPB, endTime: jump, endBeat: 12 },
      { time: jump, beat: 4, spb: SPB, endTime: Infinity, endBeat: Infinity },
    ];
    const { s } = scene({ segments: () => segments });
    // nota 4 (Ré do compasso 1, tempo 4) errada na 1ª volta
    s.judge(judgment(4, 'miss', 'not-played'), START + 4 * SPB + 0.25);
    // no tempo 6 da 1ª volta: a nota 4 dois tempos atrás e, depois de B, de novo seis tempos à frente
    s.update(START + 6 * SPB);
    const copies = s.noteView(4);
    expect(copies).toHaveLength(2);
    const [old, next] = copies.sort((a, b) => a.x - b.x);
    expect(old.marked).toBe(true);
    expect(next.marked).toBe(false);
    expect(next.x).toBeCloseTo(needleX + 6 * sheetLayout(W, H, 2).pxPerBeat);
    s.update(jump);
    expect(s.noteView(4).find((c) => Math.abs(c.x - needleX) < 1)?.alpha).toBe(1);
  });

  it('relógio vazio (antes do microfone abrir): faixa só com a pauta, sem quebrar', () => {
    const segments: BeatSegment[] = [];
    const { s } = scene({ segments: () => segments });
    expect(() => s.update(START)).not.toThrow();
    expect(s.visibleNotes()).toHaveLength(0);
    segments.push({ time: START, beat: 0, spb: SPB, endTime: Infinity, endBeat: Infinity });
    s.update(START + 0.3);
    expect(s.visibleNotes().length).toBeGreaterThan(0);
  });

  it('não copia a lista do relógio a cada quadro: pede de novo a cada 250 ms', () => {
    const clock = steadyClock(START, 100);
    const segments = vi.fn(clock.segments);
    const { s } = scene({ segments });
    segments.mockClear();
    for (let f = 0; f < 60; f++) s.update(START + f / 60);
    expect(segments.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it('ignora julgamento de nota que não existe', () => {
    const { s } = scene();
    expect(() => s.judge(judgment(9999, 'perfect'))).not.toThrow();
  });
});
