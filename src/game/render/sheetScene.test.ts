import { Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { n, ODE } from '../engine/testing';
import type { Issue, Judgment } from '../engine/types';
import type { Song } from '../notation/song';
import type { TextureBaker, JudgmentEvent } from './scene';
import { MIN_GAP_SPACES, PASSED_ALPHA, sheetLayout, steadyClock, type BeatSegment, type SheetClock } from './sheetLayout';
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

/**
 * Três compassos com pausa e ligaduras: semínima de pausa no tempo 1, Si ligado por cima da barra (tempos 2 → 4), Ré
 * ligado dentro do compasso (5 → 6), Mi ligado por cima da barra (7 → 8) e mínima de pausa no tempo 10.
 */
const TIED: Song = {
  ...ODE,
  id: 'ligaduras',
  measures: [
    { beats: 4, notes: [n(0, 1, 69, 2, 0), n(2, 2, 71, 2, 1)] },
    { beats: 4, notes: [n(0, 1, 71, 2, 1, true), n(1, 1, 74, 2, 3), n(2, 1, 74, 2, 3, true), n(3, 1, 76, 3, 0)] },
    { beats: 4, notes: [n(0, 1, 76, 3, 0, true), n(1, 1, 74, 2, 3)] },
  ],
};

function scene(clock: SheetClock = steadyClock(START, 100), theme = cadernoTheme, song: Song = ODE) {
  const { baker, generateTexture } = fakeBaker();
  const s = new SheetScene(baker, { theme, song, clock, reducedMotion: false });
  s.layout(W, H);
  return { s, generateTexture };
}

const needleX = sheetLayout(W, H, 2).needleX;
const pxPerBeat = sheetLayout(W, H, 2).pxPerBeat;

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
    // a nota 1 acabou de passar inteira pela agulha e ainda não chegou à clave
    const now = START + 2.02 * SPB;
    const hit = scene().s;
    hit.judge(judgment(1, 'perfect'), START + SPB);
    hit.update(now);
    expect(hit.noteView(1)[0].alpha).toBeGreaterThan(0.9);
    expect(hit.noteView(1)[0].marked).toBe(false);
    const miss = scene().s;
    miss.judge(judgment(1, 'miss', 'not-played'), START + SPB + 0.25);
    miss.update(now);
    expect(miss.noteView(1)[0].alpha).toBeLessThanOrEqual(PASSED_ALPHA);
    expect(miss.noteView(1)[0].marked).toBe(true);
    expect(miss.noteView(2)[0].alpha).toBe(1);
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

  it('pausa no vão, no seu tempo, passando pela agulha como a nota', () => {
    const { s } = scene(steadyClock(START, 100), cadernoTheme, TIED);
    s.update(START + SPB);
    const rest = s.restView().find((r) => r.rest === 0);
    expect(rest?.x).toBeCloseTo(needleX);
    s.update(START + 2 * SPB);
    expect(s.restView().find((r) => r.rest === 0)?.x).toBeCloseTo(needleX - pxPerBeat);
  });

  it('arco entre as cabeças ligadas, dentro do compasso e atravessando a barra', () => {
    const { s } = scene(steadyClock(START, 100), cadernoTheme, TIED);
    s.update(START + 4 * SPB);
    const ties = s.tieView().sort((a, b) => a.tie - b.tie);
    expect(ties.map((t) => t.tie)).toEqual([0, 1, 2]);
    // ligadura 0: do Si do tempo 2 (duas cabeças atrás da agulha) ao do tempo 4 (na agulha), por cima da barra
    expect(ties[0].from).toBeGreaterThan(needleX - 2 * pxPerBeat);
    expect(ties[0].to).toBeLessThan(needleX);
    expect(ties[1].from).toBeGreaterThan(needleX + pxPerBeat);
    expect(ties[1].to).toBeLessThan(needleX + 2 * pxPerBeat);
  });

  it('laço A–B: a última nota de B não se liga à primeira de A, nem A ao que vem antes dele', () => {
    // laço no compasso 1 (tempos 4 a 8): salto no tempo 8
    const jump = START + 8 * SPB;
    const segments: BeatSegment[] = [{ time: START, beat: 0, spb: SPB, endTime: jump, endBeat: 8 }];
    for (let lap = 0; lap < 4; lap++) {
      const time = jump + lap * 4 * SPB;
      segments.push({ time, beat: 4, spb: SPB, endTime: time + 4 * SPB, endBeat: 8 });
    }
    const looped = scene({ segments: () => segments }, cadernoTheme, TIED).s;
    const straight = scene(steadyClock(START, 100), cadernoTheme, TIED).s;
    for (const now of [START + 7 * SPB, jump + 0.1, jump + 3.5 * SPB]) {
      looped.update(now);
      expect(looped.tieView().map((t) => t.tie)).not.toContain(2);
      expect(looped.tieView().map((t) => t.tie)).not.toContain(0);
    }
    // sem laço, a mesma ligadura 2 (do tempo 7 ao 8) aparece
    straight.update(START + 7 * SPB);
    expect(straight.tieView().map((t) => t.tie)).toContain(2);
    // no laço, a ligadura de dentro de A aparece em cada cópia: a volta que passou e as duas que vêm na faixa
    looped.update(START + 7 * SPB);
    expect(looped.tieView().filter((t) => t.tie === 1)).toHaveLength(3);
  });

  it.each([
    ['partida comum', () => steadyClock(START, 100)],
    [
      'laço com troca de andamento',
      (): SheetClock => {
        const jump = START + 8 * SPB;
        const segments: BeatSegment[] = [
          { time: START, beat: 0, spb: SPB, endTime: jump, endBeat: 8 },
          { time: jump, beat: 4, spb: SPB * 1.5, endTime: jump + 6 * SPB, endBeat: 8 },
          { time: jump + 6 * SPB, beat: 4, spb: SPB * 1.5, endTime: Infinity, endBeat: Infinity },
        ];
        return { segments: () => segments };
      },
    ],
  ])('%s: a 60 e a 120 fps, no mesmo instante a faixa está na mesma posição', (_name, clock) => {
    const frames = (fps: number) => {
      const { s } = scene(clock(), cadernoTheme, TIED);
      const seen: string[] = [];
      // 8 s de música, da entrada à segunda volta; foto a cada 1/60 s
      for (let f = 0; f <= 8 * fps; f++) {
        s.update(START - 1 + f / fps);
        if (f % (fps / 60) !== 0) continue;
        const notes = s.visibleNotes().flatMap((i) => s.noteView(i).map((v) => `${i}:${v.x.toFixed(3)}:${v.alpha.toFixed(3)}`));
        const rests = s.restView().map((r) => `${r.rest}:${r.x.toFixed(3)}`);
        const ties = s.tieView().map((t) => `${t.tie}:${t.from.toFixed(3)}:${t.to.toFixed(3)}`);
        seen.push([...new Set(notes)].sort().join(' ') + ' | ' + rests.sort().join(' ') + ' | ' + ties.sort().join(' '));
      }
      return seen;
    };
    const at60 = frames(60);
    const at120 = frames(120);
    expect(at60).toHaveLength(8 * 60 + 1);
    expect(at60.filter((f) => f.includes('|  |'))).not.toHaveLength(at60.length);
    expect(at120).toEqual(at60);
  });

  it('ignora julgamento de nota que não existe', () => {
    const { s } = scene();
    expect(() => s.judge(judgment(9999, 'perfect'))).not.toThrow();
  });

  it('laço A–B: banda, linhas de A e B com bandeirinha e o arco de volta; o A da volta nova cai no B da anterior', () => {
    // Laço nos compassos 2–3 (tempos 4 a 12), com as voltas já na linha do tempo
    const jump = START + 12 * SPB;
    const lap = 8 * SPB;
    const segments: BeatSegment[] = [{ time: START, beat: 0, spb: SPB, endTime: jump, endBeat: 12 }];
    for (let k = 0; k < 6; k++) segments.push({ time: jump + k * lap, beat: 4, spb: SPB, endTime: jump + (k + 1) * lap, endBeat: 12 });
    let loop: { startMeasure: number; endMeasure: number } | null = { startMeasure: 1, endMeasure: 2 };
    const { baker, generateTexture } = fakeBaker();
    const s = new SheetScene(baker, { theme: cadernoTheme, song: ODE, clock: { segments: () => segments, currentLoop: () => loop }, reducedMotion: false });
    const theme = generateTexture.mock.calls.length;
    s.layout(W, H);
    const baked = generateTexture.mock.calls.length;
    // As bandeirinhas "A · 2" e "B · 3" e as só com a letra da faixa compacta (texto e caixa de cada uma)
    expect(baked - theme).toBe(8);

    // Primeira passada, antes de A: a linha de A à frente, e o B lá na frente com o arco voltando
    s.update(START + 2 * SPB);
    let view = s.loopView();
    expect(view.a).toHaveLength(1);
    expect(view.a[0]).toBeGreaterThan(needleX);
    expect(view.arcs).toHaveLength(1);
    expect(view.bands[0][0]).toBeCloseTo(view.a[0]);

    // Um tempo antes do salto: B à frente da agulha, e o A da volta seguinte na mesma linha
    s.update(jump - SPB);
    view = s.loopView();
    const b = view.b.find((x) => x > needleX)!;
    expect(b).toBeGreaterThan(needleX);
    expect(b).toBeLessThan(needleX + pxPerBeat);
    expect(view.a.some((x) => Math.abs(x - b) < 0.5)).toBe(true);
    expect(view.arcs.some((x) => Math.abs(x - b) < 0.5)).toBe(true);
    // A banda cobre a passada até B e continua na volta seguinte
    expect(view.bands.some(([, end]) => Math.abs(end - b) < 0.5)).toBe(true);
    expect(view.bands.some(([start]) => Math.abs(start - b) < 0.5)).toBe(true);

    // Os quadros não assam nada: as bandeirinhas são do laço, não do quadro
    for (let t = 0; t < 2; t += 1 / 60) s.update(jump + t);
    expect(generateTexture.mock.calls.length).toBe(baked);

    // Laço desligado: na próxima consulta ao relógio, nada marcado
    loop = null;
    s.update(jump + 3);
    expect(s.loopView()).toEqual({ a: [], b: [], bands: [], arcs: [] });
    s.destroy();
  });

  it('nota errada: cabeça vazada na altura tocada e "VOCÊ" no nome; a não tocada só leva o ×', () => {
    const { s } = scene();
    const at = START + 0.2;
    // Ode começa em Fá♯5 (78) na corda Mi; tocou Lá5 (81), dois graus acima
    s.judge({ ...judgment(0, 'miss', 'wrong-note'), playedMidi: 81 }, at);
    s.judge(judgment(1, 'miss', 'not-played'), START + SPB + 0.2);
    s.update(START + SPB + 0.2);
    const l = sheetLayout(W, H, 2);
    const [wrong] = s.wrongView(0);
    expect(wrong.you).toBe(true);
    expect(wrong.ghostY).toBeLessThan(l.middleY);
    expect(s.wrongView(1)).toEqual([{ ghostY: null, you: false }]);
    expect(s.noteView(1)[0].marked).toBe(true);
  });

  it('a nota errada julgada só quando a janela fecha (0,9 s depois) ainda leva a marca, também no laço', () => {
    const { s } = scene();
    s.judge({ ...judgment(0, 'miss', 'wrong-note'), playedMidi: 81 }, START + 0.9);
    s.update(START + 0.9);
    expect(s.noteView(0)[0].marked).toBe(true);
    expect(s.wrongView(0)[0].ghostY).not.toBeNull();

    // Laço de um compasso (2,4 s): a volta seguinte da mesma nota não herda a marca
    const lap = 4 * SPB;
    const segments: BeatSegment[] = Array.from({ length: 4 }, (_, k) => ({ time: START + k * lap, beat: 0, spb: SPB, endTime: START + (k + 1) * lap, endBeat: 4 }));
    const looped = scene({ segments: () => segments }).s;
    looped.judge(judgment(1, 'miss', 'not-played'), START + lap + SPB + 0.9);
    looped.update(START + lap + SPB + 0.9);
    const copies = looped.noteView(1);
    expect(copies.filter((c) => c.marked)).toHaveLength(1);
    expect(copies.find((c) => c.marked)!.x).toBeLessThan(needleX);
  });

  it('sem laço no relógio (a partida comum), nada de A e B', () => {
    const { s } = scene();
    s.update(START + 3);
    expect(s.loopView()).toEqual({ a: [], b: [], bands: [], arcs: [] });
  });

  it.each([
    ['tela 5b', W, H],
    ['celular deitado (844×390)', 810, 184],
    ['compacta', 810, 112],
  ])('%s: semicolcheia e pausa curta não colam na vizinha, e cada nota passa na agulha na hora dela', (_name, width, height) => {
    // Fá♯5 e Sol5 a uma semicolcheia; semínima pontuada e pausa de semicolcheia; colcheia e pausa de colcheia
    const tight: Song = {
      ...ODE,
      id: 'apertada',
      measures: [
        { beats: 4, notes: [n(0, 1, 76, 3, 0), n(1.75, 0.25, 78, 3, 1), n(2, 1, 79, 3, 2), n(3, 0.75, 81, 3, 3)] },
        { beats: 4, notes: [n(0, 0.5, 76, 3, 0), n(1, 3, 74, 2, 3)] },
      ],
    };
    const { baker } = fakeBaker();
    const s = new SheetScene(baker, { theme: cadernoTheme, song: tight, clock: steadyClock(START, 100), reducedMotion: false });
    s.layout(width, height);
    const l = sheetLayout(width, height, 2);
    s.update(START);
    const xs = [...s.notesX(), ...s.restView().map((r) => r.x)].sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThan(5);
    const gaps = xs.slice(1).map((x, i) => x - xs[i]);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(MIN_GAP_SPACES * l.space - 1e-6);
    tight.measures[0].notes.forEach((note, i) => {
      s.update(START + note.beat * SPB);
      expect(s.noteView(i)[0].x).toBeCloseTo(l.needleX);
    });
  });
});
