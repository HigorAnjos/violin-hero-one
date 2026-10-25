import { describe, expect, it } from 'vitest';
import { DEFAULT_A4, MAX_A4, MIN_A4, OPEN_STRING_MIDI, midiToFrequency } from '../notation/violin';
import {
  assertA4,
  centsBetween,
  frequencyToMidi,
  nearestString,
  noteName,
  readNote,
  solfegeName,
  tuneState,
  tuneString,
} from './tuning';

describe('notas', () => {
  it('nomeia em notação científica e em solfejo', () => {
    expect(noteName(69)).toBe('A4');
    expect(noteName(55)).toBe('G3');
    expect(noteName(78)).toBe('F#5');
    expect(solfegeName(69)).toBe('Lá 4');
    expect(solfegeName(61)).toBe('Dó♯ 4');
  });

  it('converte frequência em MIDI no Lá dado', () => {
    expect(frequencyToMidi(442, 442)).toBeCloseTo(69, 10);
    expect(frequencyToMidi(440, 440)).toBeCloseTo(69, 10);
    expect(frequencyToMidi(midiToFrequency(55, 442), 442)).toBeCloseTo(55, 10);
  });

  it('mede cents', () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 10);
    expect(centsBetween(440, 442)).toBeCloseTo(-7.85, 2);
  });
});

describe('readNote', () => {
  it('lê nota e cents no Lá padrão 442', () => {
    expect(readNote(442, DEFAULT_A4)).toMatchObject({ midi: 69, name: 'A4', solfege: 'Lá 4' });
    expect(readNote(442, DEFAULT_A4)!.cents).toBeCloseTo(0, 10);
    expect(readNote(midiToFrequency(62.2), DEFAULT_A4)!.cents).toBeCloseTo(20, 6);
  });

  it('o mesmo som muda de cents quando o Lá muda', () => {
    expect(readNote(440, 440)!.cents).toBeCloseTo(0, 6);
    expect(readNote(440, 442)!.cents).toBeCloseTo(-7.85, 2);
  });

  it('arredonda para a nota mais próxima perto do meio-tom', () => {
    expect(readNote(midiToFrequency(62.49), 442)!.midi).toBe(62);
    expect(readNote(midiToFrequency(62.51), 442)!.midi).toBe(63);
  });

  it('recusa frequência inválida', () => {
    expect(readNote(0, 442)).toBeNull();
    expect(readNote(Number.NaN, 442)).toBeNull();
    expect(readNote(-1, 442)).toBeNull();
  });
});

describe('assertA4', () => {
  it('aceita a faixa do jogo e recusa fora dela', () => {
    expect(() => assertA4(MIN_A4)).not.toThrow();
    expect(() => assertA4(MAX_A4)).not.toThrow();
    expect(() => assertA4(MIN_A4 - 1)).toThrow(RangeError);
    expect(() => assertA4(Number.NaN)).toThrow(RangeError);
  });
});

describe('afinador por corda', () => {
  it.each([0, 1, 2, 3] as const)('acha a corda %i afinada', (string) => {
    const hz = midiToFrequency(OPEN_STRING_MIDI[string]);
    const tuning = tuneString(hz, DEFAULT_A4)!;
    expect(tuning.string).toBe(string);
    expect(tuning.state).toBe('in-tune');
    expect(tuning.turn).toBeNull();
    expect(tuning.targetHz).toBeCloseTo(hz, 6);
  });

  it('diz quanto falta e para que lado', () => {
    const flat = tuneString(midiToFrequency(62 - 0.3), DEFAULT_A4)!;
    expect(flat).toMatchObject({ string: 1, state: 'off', turn: 'up' });
    expect(flat.cents).toBeCloseTo(-30, 6);

    const sharp = tuneString(midiToFrequency(76 + 0.1), DEFAULT_A4)!;
    expect(sharp).toMatchObject({ string: 3, state: 'close', turn: 'down' });
    expect(sharp.cents).toBeCloseTo(10, 6);
  });

  it('uma corda muito frouxa continua sendo ela', () => {
    const tuning = tuneString(midiToFrequency(69 - 1.5), DEFAULT_A4)!;
    expect(tuning.string).toBe(2);
    expect(tuning.cents).toBeCloseTo(-150, 6);
  });

  it('mede contra a corda pedida', () => {
    const tuning = tuneString(midiToFrequency(69), DEFAULT_A4, 1)!;
    expect(tuning.string).toBe(1);
    expect(tuning.cents).toBeCloseTo(700, 6);
  });

  it('respeita o Lá ajustado', () => {
    const tuning = tuneString(440, 440)!;
    expect(tuning).toMatchObject({ string: 2, state: 'in-tune' });
    expect(tuneString(440, 442)!.cents).toBeCloseTo(-7.85, 2);
  });

  it('escolhe a corda mais próxima no meio do caminho', () => {
    expect(nearestString(midiToFrequency(58.4), DEFAULT_A4)).toBe(0);
    expect(nearestString(midiToFrequency(58.6), DEFAULT_A4)).toBe(1);
    expect(nearestString(midiToFrequency(90), DEFAULT_A4)).toBe(3);
    expect(nearestString(midiToFrequency(40), DEFAULT_A4)).toBe(0);
  });

  it('recusa frequência inválida', () => {
    expect(tuneString(0, DEFAULT_A4)).toBeNull();
  });

  it('classifica o estado pelo módulo dos cents', () => {
    expect(tuneState(-5)).toBe('in-tune');
    expect(tuneState(15)).toBe('close');
    expect(tuneState(-15.1)).toBe('off');
  });
});
