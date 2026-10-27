import { describe, expect, it } from 'vitest';
import { createDictation, dictate, dictationOrigin, secondsPerQuarter, writeDictated, type DictatedNote, type DictationOptions, type DictationReading } from './dictation';
import { createEditor, editorSong, insertNote } from './editor';
import { timeline } from './song';

const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74];
const HOP = 0.01;
const LATENCY = 0.08;
const FOUR_FOUR = { beats: 4, unit: 4 } as const;

/** Uma nota tocada, em segundos desde o primeiro tempo do ditado (a hora em que o som sai do violino). */
interface Played {
  midi: number;
  start: number;
  end: number;
  cents?: number;
  /** Vibrato em volta da nota: profundidade em cents, a 5,5 Hz. */
  vibratoCents?: number;
  /** Começo do arco arranhado: alturas vizinhas e clareza baixa antes de firmar. */
  scratchSeconds?: number;
  level?: number;
  /** Queda de nível sem silêncio (troca de arco) logo antes desta nota. */
  bowChange?: boolean;
}

/**
 * As leituras que o Ouvido entregaria: uma a cada 10 ms com a hora do relógio (atrasada pela latência do aparelho),
 * e `null` uma vez quando o som acaba. `startAt` é a hora do primeiro tempo.
 */
function readings(played: Played[], startAt = 10, latency = LATENCY): (DictationReading | null)[] {
  const out: (DictationReading | null)[] = [];
  played.forEach((note, i) => {
    const next = played[i + 1];
    const steps = Math.round((note.end - note.start) / HOP);
    for (let k = 0; k < steps; k++) {
      const t = note.start + k * HOP;
      const vibrato = note.vibratoCents ? note.vibratoCents * Math.sin(2 * Math.PI * 5.5 * (t - note.start)) : 0;
      const scratch = note.scratchSeconds !== undefined && t - note.start < note.scratchSeconds;
      const exact = note.midi + ((note.cents ?? 0) + vibrato) / 100;
      out.push({
        time: startAt + latency + t,
        midi: scratch ? note.midi + (k % 2 ? 1 : -2) : Math.round(exact),
        level: (note.level ?? -20) - (note.bowChange && k < 4 ? 18 - k * 4 : 0),
        clarity: scratch ? 0.92 : 0.97,
      });
    }
    const legato = next && Math.abs(next.start - note.end) < HOP / 2;
    if (!legato) out.push(null);
  });
  return out;
}

/** Escala em semínimas no andamento: arco destacado (100 ms de silêncio no fim de cada nota), como o WAV do e2e. */
function scale(bpm: number, midis = D_MAJOR, extra: Partial<Played> = {}): Played[] {
  const beat = secondsPerQuarter(bpm, FOUR_FOUR);
  return midis.map((midi, i) => ({ midi, start: i * beat, end: (i + 1) * beat - 0.1, ...extra }));
}

const options = (bpm: number, more: Partial<DictationOptions> = {}): DictationOptions => ({ bpm, timeSignature: FOUR_FOUR, startAt: 10, latencySeconds: LATENCY, ...more });
const quarters = (midis: number[]): DictatedNote[] => midis.map((midi, i) => ({ at: i, length: 1, midi }));

describe('ditado: escala de Ré maior em semínimas', () => {
  it.each([60, 90])('a %i bpm sai a escala inteira, uma semínima por tempo', (bpm) => {
    expect(dictate(readings(scale(bpm)), options(bpm))).toEqual(quarters(D_MAJOR));
  });

  it('com vibrato largo (±60 cents): a nota vizinha que aparece no pico do vibrato não vira nota', () => {
    expect(dictate(readings(scale(60, D_MAJOR, { vibratoCents: 60 })), options(60))).toEqual(quarters(D_MAJOR));
  });

  it('ataque arranhado (60 ms de alturas vizinhas): uma nota só, que começa no começo do som', () => {
    expect(dictate(readings(scale(90, D_MAJOR, { scratchSeconds: 0.06 })), options(90))).toEqual(quarters(D_MAJOR));
  });

  it('ataques atrasados até um pouco menos de meia colcheia caem no tempo certo', () => {
    const beat = 1;
    const late = scale(60).map((n, i) => ({ ...n, start: n.start + (i % 2 ? 0.2 : 0.1), end: n.end + (i % 2 ? 0.1 : 0) }));
    expect(late[1].start).toBeCloseTo(beat + 0.2);
    expect(dictate(readings(late), options(60))).toEqual(quarters(D_MAJOR));
  });

  it('sem descontar a latência, um atraso grande do aparelho empurra tudo meia colcheia', () => {
    const slow = readings(scale(60), 10, 0.3);
    expect(dictate(slow, options(60, { latencySeconds: 0.3 }))).toEqual(quarters(D_MAJOR));
    expect(dictate(slow, options(60, { latencySeconds: 0 })).map((n) => n.at)).toEqual([0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5]);
  });

  it('nota desafinada (40 cents alta) fica a temperada mais próxima', () => {
    const played = scale(60);
    played[2] = { ...played[2], cents: 40 };
    played[5] = { ...played[5], cents: -45 };
    expect(dictate(readings(played), options(60))).toEqual(quarters(D_MAJOR));
  });
});

describe('ditado: notas repetidas', () => {
  it('a mesma altura duas vezes com silêncio no meio são duas notas', () => {
    expect(dictate(readings(scale(60, [69, 69, 71, 71])), options(60))).toEqual(quarters([69, 69, 71, 71]));
  });

  it('com troca de arco sem silêncio (o nível cai e volta) também são duas', () => {
    const played: Played[] = [
      { midi: 69, start: 0, end: 1 },
      { midi: 69, start: 1, end: 2, bowChange: true },
      { midi: 71, start: 2, end: 2.9 },
    ];
    expect(dictate(readings(played), options(60))).toEqual(quarters([69, 69, 71]));
  });

  it('sem silêncio nem queda de nível é uma nota só, mais longa', () => {
    const played: Played[] = [
      { midi: 69, start: 0, end: 1 },
      { midi: 69, start: 1, end: 1.9 },
    ];
    expect(dictate(readings(played), options(60))).toEqual([{ at: 0, length: 2, midi: 69 }]);
  });
});

describe('ditado: o que não vira nota', () => {
  it('estalo de ruído (40 ms) e leituras de clareza baixa ficam de fora', () => {
    const played = scale(60, [62, 64]);
    const noisy = [
      ...readings([{ midi: 80, start: -0.5, end: -0.46 }]),
      ...readings(played).map((r) => r),
      { time: 13, midi: 77, level: -30, clarity: 0.5 },
      { time: 13.01, midi: 77, level: -30, clarity: 0.5 },
    ];
    expect(dictate(noisy, options(60))).toEqual(quarters([62, 64]));
  });

  it('nota de menos de ~1/16 no andamento é descartada; um pouco mais que isso entra', () => {
    // A 60 bpm a semicolcheia dura 250 ms
    const played: Played[] = [
      { midi: 69, start: 0, end: 0.15 },
      { midi: 71, start: 1, end: 1.3 },
    ];
    expect(dictate(readings(played), options(60))).toEqual([{ at: 1, length: 0.5, midi: 71 }]);
  });

  it('o que soou inteiro na contagem fica de fora', () => {
    const played: Played[] = [
      { midi: 69, start: -2, end: -1.2 },
      { midi: 71, start: 0, end: 0.9 },
    ];
    expect(dictate(readings(played), options(60))).toEqual([{ at: 0, length: 1, midi: 71 }]);
  });
});

describe('ditado: grade e ritmo', () => {
  it('colcheias na grade de colcheia; com semicolcheia, as semicolcheias aparecem', () => {
    const eighths: Played[] = [62, 64, 66, 67].map((midi, i) => ({ midi, start: i * 0.5, end: i * 0.5 + 0.42 }));
    expect(dictate(readings(eighths), options(60))).toEqual([62, 64, 66, 67].map((midi, i) => ({ at: i * 0.5, length: 0.5, midi })));
    const sixteenths: Played[] = [62, 64, 66, 67].map((midi, i) => ({ midi, start: i * 0.25, end: i * 0.25 + 0.22 }));
    expect(dictate(readings(sixteenths), options(60, { grid: 0.25 }))).toEqual([62, 64, 66, 67].map((midi, i) => ({ at: i * 0.25, length: 0.25, midi })));
  });

  it('pausa: o silêncio maior que a célula fica como vão entre as notas', () => {
    const played: Played[] = [
      { midi: 69, start: 0, end: 0.9 },
      { midi: 71, start: 2, end: 2.9 },
    ];
    expect(dictate(readings(played), options(60))).toEqual([
      { at: 0, length: 1, midi: 69 },
      { at: 2, length: 1, midi: 71 },
    ]);
  });

  it('em 6/8 o bpm conta colcheias: a semínima pontuada dura 3 colcheias', () => {
    const spq = secondsPerQuarter(120, { beats: 6, unit: 8 });
    expect(spq).toBeCloseTo(1);
    const played: Played[] = [{ midi: 69, start: 0, end: 1.45 }];
    expect(dictate(readings(played), { ...options(120), timeSignature: { beats: 6, unit: 8 } })).toEqual([{ at: 0, length: 1.5, midi: 69 }]);
  });

  it('ao vivo: cada nota sai assim que acaba, e a que ainda soa sai no finish', () => {
    const dictation = createDictation(options(60));
    const all = readings(scale(60, [62, 64]));
    const firstEnd = all.indexOf(null);
    const before = all.slice(0, firstEnd + 1).flatMap((r) => dictation.push(r));
    expect(before).toEqual([{ at: 0, length: 1, midi: 62 }]);
    const rest = all.slice(firstEnd + 1, -1).flatMap((r) => dictation.push(r));
    expect(rest).toEqual([]);
    expect(dictation.finish(12.2)).toEqual([{ at: 1, length: 1, midi: 64 }]);
  });
});

describe('ditado no editor', () => {
  it('começa no compasso depois da última nota escrita', () => {
    const empty = createEditor();
    expect(dictationOrigin(empty)).toBe(0);
    const some = insertNote(insertNote(empty, 62), 64);
    expect(dictationOrigin(some)).toBe(4);
  });

  it('as notas entram pelo insertNote: a Song fica com a escala, e a nota fora do violino é recusada', () => {
    let state = createEditor();
    for (const note of quarters(D_MAJOR)) state = writeDictated(state, 0, note);
    expect(timeline(editorSong(state)).map((n) => `${n.at}:${n.beats}:${n.midi}`)).toEqual(D_MAJOR.map((m, i) => `${i}:1:${m}`));
    const refused = writeDictated(state, 0, { at: 8, length: 1, midi: 40 });
    expect(refused.refusal).toMatch(/não cabe no violino/);
    expect(refused.cursor).toBe(state.cursor);
    expect(refused.doc).toBe(state.doc);
  });
});
