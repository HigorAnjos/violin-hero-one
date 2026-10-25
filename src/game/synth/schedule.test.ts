import { describe, expect, it } from 'vitest';
import { scheduleNotes } from '../engine/engine';
import { parseSong, songDurationBeats, songDurationSeconds, type Song } from '../notation/song';
import { findFixedSong } from '../notation/songs';
import { midiToFrequency } from '../notation/violin';
import { arrange } from './arrange';
import { n } from '../engine/testing';
import { beatTime, duckWindows, notesSoundingAt, scheduleOrchestra } from './schedule';
import { VOICES } from './voices';

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
    for (const note of notes) expect(note.frequency).toBeCloseTo(midiToFrequency(note.midi, 440), 9);
  });

  it('end soma o release da voz; com fone, o arranjo completo, sem desvio', () => {
    const notes = scheduleOrchestra(song, { startAt: START_AT });
    for (const note of notes) expect(note.end).toBeCloseTo(note.time + note.duration + VOICES[note.part].release, 12);
    const full = scheduleOrchestra(song, { startAt: START_AT, headphones: true });
    expect(full.length).toBeGreaterThanOrEqual(notes.length);
    expect(full.map((note) => note.midi)).not.toEqual(notes.map((note) => note.midi));
  });

  it('em ordem de tempo', () => {
    const notes = scheduleOrchestra(song, { startAt: START_AT });
    for (let i = 1; i < notes.length; i++) expect(notes[i].time).toBeGreaterThanOrEqual(notes[i - 1].time);
  });
});

describe('notesSoundingAt', () => {
  const song = findFixedSong('brilha-brilha-estrelinha')!.song;
  const notes = scheduleOrchestra(song, { startAt: 2 });

  it('é o mesmo que filtrar a lista inteira, em qualquer instante', () => {
    for (let t = 0; t < 40; t += 0.137) {
      const brute = notes.filter((note) => note.time <= t && t < note.end);
      expect(notesSoundingAt(notes, t)).toEqual(brute);
      expect(notesSoundingAt(notes, t, ['strings'])).toEqual(brute.filter((note) => note.section === 'strings'));
    }
  });

  it('nunca devolve a nota esperada do violino nem a oitava dela enquanto ela soa', () => {
    for (const note of scheduleNotes(song, 2)) {
      const mid = note.time + Math.min(note.duration, 0.2) / 2;
      for (const sounding of notesSoundingAt(notes, mid)) {
        if (sounding.time + sounding.duration <= mid) continue;
        expect([0, 12]).not.toContain(Math.abs(sounding.midi - note.midi));
      }
    }
  });
});

describe('duckWindows', () => {
  it('uma janela de ±50 ms por ataque, sem as ligadas, juntando as que se encostam', () => {
    const song: Song = {
      ...findFixedSong('escala-re-maior')!.song,
      bpm: 600,
      measures: [{ beats: 4, notes: [n(0, 1, 62, 1, 0), n(1, 1, 62, 1, 0, true), n(2, 1, 64, 1, 1), n(3, 1, 66, 1, 2)] }],
    };
    const windows = duckWindows(song, 1);
    expect(windows).toHaveLength(2);
    expect(windows[0].from).toBeCloseTo(0.95, 12);
    expect(windows[0].to).toBeCloseTo(1.05, 12);
    expect(windows[1].from).toBeCloseTo(1.15, 12);
    expect(windows[1].to).toBeCloseTo(1.35, 12);
  });
});
