import { describe, expect, it } from 'vitest';
import { alignFirstOnset, decodeWav, encodeWav, firstOnset } from './wav';

function wavBytes(format: number, bits: number, channels: number, sampleRate: number, frames: number[][]): Uint8Array {
  const width = bits / 8;
  const dataBytes = frames.length * channels * width;
  const bytes = new Uint8Array(56 + dataBytes);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, s: string) => [...s].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  tag(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint16(34, bits, true);
  tag(36, 'LIST');
  view.setUint32(40, 4, true);
  tag(44, 'INFO');
  tag(48, 'data');
  view.setUint32(52, dataBytes, true);
  let at = 56;
  for (const frame of frames) {
    for (const v of frame) {
      if (format === 3) view.setFloat32(at, v, true);
      else if (bits === 24) {
        const i = Math.round(v * 0x7fffff);
        view.setUint8(at, i & 0xff);
        view.setUint8(at + 1, (i >> 8) & 0xff);
        view.setInt8(at + 2, i >> 16);
      } else view.setInt32(at, Math.round(v * 0x7fffffff), true);
      at += width;
    }
  }
  return bytes;
}

describe('encodeWav', () => {
  it('grava PCM 16 bits mono com o cabeçalho que o Chromium lê', () => {
    const bytes = encodeWav(Float32Array.from([0, 0.5, -1, 2]), 48000);
    const view = new DataView(bytes.buffer);
    expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe('RIFF');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([0, 16384, -32768, 32767]);
  });

  it('ida e volta preserva as amostras dentro de um passo de 16 bits', () => {
    const samples = Float32Array.from({ length: 100 }, (_, i) => Math.sin(i / 7) * 0.8);
    const decoded = decodeWav(encodeWav(samples, 44100));
    expect(decoded.sampleRate).toBe(44100);
    decoded.samples.forEach((v, i) => expect(v).toBeCloseTo(samples[i], 4));
  });
});

describe('decodeWav', () => {
  it('lê float 32 estéreo pulando blocos que não são dados, e mistura em mono', () => {
    const decoded = decodeWav(wavBytes(3, 32, 2, 48000, [[0.5, 0.1], [-0.2, -0.4]]));
    expect(decoded.samples[0]).toBeCloseTo(0.3, 6);
    expect(decoded.samples[1]).toBeCloseTo(-0.3, 6);
  });

  it.each([24, 32])('lê PCM de %i bits', (bits) => {
    const decoded = decodeWav(wavBytes(1, bits, 1, 44100, [[0.25], [-0.5]]));
    expect(decoded.samples[0]).toBeCloseTo(0.25, 5);
    expect(decoded.samples[1]).toBeCloseTo(-0.5, 5);
  });

  it('recusa o que não é WAV', () => {
    expect(() => decodeWav(new TextEncoder().encode('ID3 não é wav nenhum.'))).toThrow('não é um arquivo WAV');
  });
});

describe('alinhamento do primeiro ataque', () => {
  const take = (lead: number) => {
    const out = new Float32Array(lead + 10);
    out.fill(0.001, 0, lead);
    out.fill(0.5, lead);
    return out;
  };

  it('acha o primeiro ataque acima do limiar, ignorando o chiado', () => {
    expect(firstOnset(take(30))).toBe(30);
    expect(firstOnset(new Float32Array(10))).toBe(-1);
  });

  it('completa com silêncio quando a gravação começa cedo demais', () => {
    const aligned = alignFirstOnset(take(30), 100, 0.5);
    expect(firstOnset(aligned)).toBe(50);
    expect(aligned.length).toBe(60);
  });

  it('corta o começo quando a gravação demora a começar', () => {
    const aligned = alignFirstOnset(take(80), 100, 0.5);
    expect(firstOnset(aligned)).toBe(50);
    expect(aligned.length).toBe(60);
  });
});
