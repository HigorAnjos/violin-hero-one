/** WAV para o microfone falso do e2e (--use-file-for-fake-audio-capture). Só os testes importam daqui. */
export interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
}

const PCM = 1;
const FLOAT = 3;
const EXTENSIBLE = 0xfffe;

/** PCM 16 bits mono: o formato que o Chromium lê sem conversão. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  writeTag(bytes, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeTag(bytes, 8, 'WAVE');
  writeTag(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(bytes, 36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), true);
  }
  return bytes;
}

/** Lê PCM 16/24/32 bits ou float 32, qualquer número de canais (vira mono pela média): o que um gravador entrega. */
export function decodeWav(bytes: Uint8Array): DecodedWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readTag(bytes, 0) !== 'RIFF' || readTag(bytes, 8) !== 'WAVE') throw new TypeError('não é um arquivo WAV');
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const tag = readTag(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (tag === 'fmt ') {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
      if (format === EXTENSIBLE) format = view.getUint16(body + 24, true);
    } else if (tag === 'data') {
      if (!channels) throw new TypeError('WAV sem bloco fmt antes dos dados');
      return { samples: readSamples(view, body, Math.min(size, bytes.length - body), format, bits, channels), sampleRate };
    }
    offset = body + size + (size % 2);
  }
  throw new TypeError('WAV sem bloco data');
}

function readSamples(view: DataView, start: number, size: number, format: number, bits: number, channels: number): Float32Array {
  const width = bits / 8;
  const frames = Math.floor(size / (width * channels));
  const read = sampleReader(view, format, bits);
  const out = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += read(start + (f * channels + c) * width);
    out[f] = sum / channels;
  }
  return out;
}

function sampleReader(view: DataView, format: number, bits: number): (at: number) => number {
  if (format === FLOAT && bits === 32) return (at) => view.getFloat32(at, true);
  if (format !== PCM) throw new TypeError(`formato WAV ${format} com ${bits} bits não suportado`);
  if (bits === 16) return (at) => view.getInt16(at, true) / 0x8000;
  if (bits === 24) {
    return (at) => {
      const v = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getInt8(at + 2) << 16);
      return v / 0x800000;
    };
  }
  if (bits === 32) return (at) => view.getInt32(at, true) / 0x80000000;
  throw new TypeError(`PCM de ${bits} bits não suportado`);
}

/** Primeira amostra acima de `thresholdDb` abaixo do pico; -1 se o arquivo é silêncio. */
export function firstOnset(samples: Float32Array, thresholdDb = -24): number {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak === 0) return -1;
  const threshold = peak * 10 ** (thresholdDb / 20);
  return samples.findIndex((v) => Math.abs(v) >= threshold);
}

/**
 * Corta ou completa com silêncio o começo da gravação para o primeiro ataque cair em `atSeconds`: a gravação real
 * não começa no mesmo ponto que a sintética, mas o teste espera a primeira nota no lugar combinado.
 */
export function alignFirstOnset(samples: Float32Array, sampleRate: number, atSeconds: number, thresholdDb?: number): Float32Array {
  const onset = firstOnset(samples, thresholdDb);
  if (onset < 0) return samples;
  const shift = Math.round(atSeconds * sampleRate) - onset;
  if (shift === 0) return samples;
  if (shift < 0) return samples.slice(-shift);
  const out = new Float32Array(samples.length + shift);
  out.set(samples, shift);
  return out;
}

function writeTag(bytes: Uint8Array, at: number, tag: string): void {
  for (let i = 0; i < 4; i++) bytes[at + i] = tag.charCodeAt(i);
}

function readTag(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}
