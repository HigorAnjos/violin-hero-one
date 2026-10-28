import { Midi } from '@tonejs/midi';
import { describe, it, expect } from 'vitest';
import { isMidi, parseMidiParts } from './midi';

const PPQ = 480;

/** MIDI de teste: trilhas com [midi, início, duração] em semínimas. */
function midiFile(
  tracks: { name?: string; program?: number; channel?: number; notes: [number, number, number][] }[],
  header: { bpm?: number } = {},
): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(header.bpm ?? 90);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  for (const t of tracks) {
    const track = midi.addTrack();
    if (t.name) track.name = t.name;
    track.channel = t.channel ?? 0;
    track.instrument.number = t.program ?? 0;
    for (const [note, start, length] of t.notes) track.addNote({ midi: note, ticks: start * PPQ, durationTicks: length * PPQ });
  }
  return midi.toArray();
}

/** Igual, com fórmulas de compasso em ticks (semínimas). */
function withTimes(times: [number, [number, number]][], notes: [number, number, number][]) {
  const midi = new Midi(midiFile([{ notes }]));
  midi.header.timeSignatures = times.map(([at, ts]) => ({ ticks: at * midi.header.ppq, timeSignature: ts }));
  midi.header.update();
  return midi.toArray();
}

describe('parseMidiParts', () => {
  // A armadura lida de arquivo real está em importScore.test.ts (o gravador do @tonejs/midi 2.0.28 erra a armadura)
  it('trilha vira melodia: andamento, compassos e nota que cruza a barra (ligada); sem armadura, Dó maior', () => {
    const [part] = parseMidiParts(midiFile([{ name: 'Violino', program: 40, notes: [[62, 0, 1], [66, 1, 1], [69, 2, 4]] }], { bpm: 100 }), 'arquivo');
    expect(part).toMatchObject({ id: 't0', name: 'Violino', instrument: 40 });
    expect(part.score).toMatchObject({ title: 'arquivo', key: { fifths: 0, mode: 'major' }, bpm: 100, timeSignature: { beats: 4, unit: 4 } });
    expect(part.score.measures).toEqual([
      {
        beats: 4,
        notes: [
          { beat: 0, beats: 1, midi: 62 },
          { beat: 1, beats: 1, midi: 66 },
          { beat: 2, beats: 2, midi: 69 },
        ],
      },
      { beats: 4, notes: [{ beat: 0, beats: 2, midi: 69, tie: true }] },
    ]);
  });

  it('acorde fica com a nota mais aguda; nota sobreposta é cortada onde a próxima começa', () => {
    const [part] = parseMidiParts(midiFile([{ notes: [[60, 0, 2], [64, 0, 2], [67, 1, 2], [72, 3, 1]] }]), 'x');
    expect(part.score.measures[0].notes).toEqual([
      { beat: 0, beats: 1, midi: 64 },
      { beat: 1, beats: 2, midi: 67 },
      { beat: 3, beats: 1, midi: 72 },
    ]);
  });

  it('tempo humano: arredonda para 1/24 de semínima e o respiro curto entre notas não vira pausa', () => {
    const [part] = parseMidiParts(midiFile([{ notes: [[60, 0.01, 0.9], [62, 1.02, 0.95], [64, 2, 1], [65, 3.5, 0.5]] }]), 'x');
    expect(part.score.measures[0].notes).toEqual([
      { beat: 0, beats: 1, midi: 60 },
      { beat: 1, beats: 1, midi: 62 },
      { beat: 2, beats: 1, midi: 64 },
      { beat: 3.5, beats: 0.5, midi: 65 },
    ]);
  });

  it('compasso composto: tempos na unidade (colcheia) e andamento convertido', () => {
    const bytes = withTimes([[0, [6, 8]]], [[67, 0, 1.5], [69, 1.5, 1.5]]);
    const [part] = parseMidiParts(bytes, 'x');
    expect(part.score.timeSignature).toEqual({ beats: 6, unit: 8 });
    expect(part.score.bpm).toBe(180);
    expect(part.score.measures[0].notes).toEqual([
      { beat: 0, beats: 3, midi: 67 },
      { beat: 3, beats: 3, midi: 69 },
    ]);
  });

  it('mudança de compasso: a grade acompanha e a fórmula da música alarga', () => {
    const bytes = withTimes([[0, [2, 4]], [2, [3, 4]]], [[60, 0, 2], [62, 2, 3]]);
    const [part] = parseMidiParts(bytes, 'x');
    expect(part.score.timeSignature).toEqual({ beats: 3, unit: 4 });
    expect(part.score.measures.map((m) => m.beats)).toEqual([2, 3]);
  });

  it('bateria e trilha vazia ficam de fora; compassos antes da 1ª nota de cada trilha também', () => {
    const parts = parseMidiParts(
      midiFile([
        { name: 'Bateria', channel: 9, notes: [[36, 0, 1]] },
        { name: '', notes: [] },
        { name: 'Flauta', program: 73, notes: [[72, 4, 4]] },
      ]),
      'x',
    );
    expect(parts.map((p) => [p.id, p.name])).toEqual([['t2', 'Flauta']]);
    expect(parts[0].score.measures).toEqual([{ beats: 4, notes: [{ beat: 0, beats: 4, midi: 72 }] }]);
  });

  it('arquivo cortado ou sem notas é recusado', () => {
    const bytes = midiFile([{ notes: [[60, 0, 1]] }]);
    expect(() => parseMidiParts(bytes.slice(0, 30), 'x')).toThrow(/MIDI/);
    expect(() => parseMidiParts(midiFile([{ notes: [] }]), 'x')).toThrow(/nenhuma trilha/);
    expect(isMidi(bytes)).toBe(true);
    expect(isMidi(new TextEncoder().encode('X:1'))).toBe(false);
  });
});
