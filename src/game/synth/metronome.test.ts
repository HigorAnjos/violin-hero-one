import { describe, expect, it } from 'vitest';
import { scheduleNotes } from '../engine/engine';
import { findFixedSong } from '../notation/songs';
import { countIn } from './metronome';

const ode = findFixedSong('ode-a-alegria')!.song;

describe('contagem de entrada', () => {
  it('um compasso de 4/4 a 100 bpm: 4, 3, 2, 1 terminando um tempo antes do primeiro tempo da música', () => {
    const beats = countIn(ode, { startAt: 10 });
    expect(beats.map((b) => b.count)).toEqual([4, 3, 2, 1]);
    expect(beats.map((b) => b.downbeat)).toEqual([true, false, false, false]);
    beats.forEach((beat, i) => expect(beat.time).toBeCloseTo(10 - (4 - i) * 0.6, 12));
    const first = scheduleNotes(ode, 10)[0];
    expect(first.time - beats.at(-1)!.time).toBeCloseTo(0.6, 12);
  });

  it('segue o andamento da partida e o número de compassos', () => {
    const beats = countIn({ bpm: 90, timeSignature: { beats: 3, unit: 4 } }, { startAt: 5, bpm: 60, bars: 2 });
    expect(beats.map((b) => b.count)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(beats.filter((b) => b.downbeat).map((b) => b.time)).toEqual([-1, 2]);
    expect(countIn(ode, { startAt: 5, bars: 0 })).toEqual([]);
  });

  it('recusa andamento ou compassos inválidos', () => {
    expect(() => countIn(ode, { startAt: 0, bpm: 0 })).toThrow(RangeError);
    expect(() => countIn(ode, { startAt: 0, bars: 1.5 })).toThrow(RangeError);
  });

});
