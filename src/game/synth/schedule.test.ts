import { describe, expect, it } from 'vitest';
import { scheduleNotes } from '../engine/engine';
import { parseSong, songDurationBeats, songDurationSeconds, type Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { midiToFrequency } from '../notation/violin';
import { arrange } from './arrange';
import { beatTime, scheduleOrchestra } from './schedule';

const START_AT = 7.3;

/** A Ode à Alegria inteira repetida até passar de 3 min. */
function threeMinuteSong(): Song {
  const ode = findFixedSong('ode-a-alegria')!.song;
  const measures = [];
  while (measures.length * 4 * (60 / ode.bpm) < 180) measures.push(...ode.measures);
  return parseSong({ ...ode, id: 'ode-longa', measures });
}

describe('agenda da orquestra no relógio do Motor', () => {
  const song = threeMinuteSong();

  it('a música de teste passa de 3 min', () => {
    expect(songDurationSeconds(song)).toBeGreaterThan(180);
  });

  it.each([undefined, 75, 133])('bpm %s: todo ataque da melodia que abre um acorde cai no mesmo instante, bit a bit, do Motor', (bpm) => {
    const engine = scheduleNotes(song, START_AT, bpm);
    const orchestra = scheduleOrchestra(song, { startAt: START_AT, bpm });
    const bass = orchestra.filter((note) => note.part === 'bass');
    let matched = 0;
    for (const note of bass) {
      const attack = engine.find((e) => Math.abs(e.time - note.time) < 0.001);
      if (!attack) continue;
      expect(note.time).toBe(attack.time);
      matched++;
    }
    expect(matched).toBe(bass.length);
  });

  it('sem deriva: a última nota termina exatamente em startAt + duração, e cada nota em startAt + tempo × 60/bpm', () => {
    const spb = 60 / song.bpm;
    const notes = scheduleOrchestra(song, { startAt: START_AT });
    const end = Math.max(...notes.map((note) => note.time + note.duration));
    expect(end).toBeCloseTo(START_AT + songDurationBeats(song) * spb, 9);
    const { parts } = arrange(song);
    const timpani = notes.filter((note) => note.part === 'timpani');
    timpani.forEach((note, i) => expect(note.time).toBe(beatTime(START_AT, parts.timpani[i].beat, spb)));
  });

  it('frequências no Lá da partida e só os naipes pedidos', () => {
    const notes = scheduleOrchestra(song, { startAt: 0, a4: 440, sections: ['percussion'] });
    expect(new Set(notes.map((note) => note.part))).toEqual(new Set(['timpani']));
    expect(notes[0].frequency).toBeCloseTo(midiToFrequency(38, 440), 9);
  });

  it('em ordem de tempo', () => {
    const notes = scheduleOrchestra(song, { startAt: START_AT });
    for (let i = 1; i < notes.length; i++) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
  });
});
