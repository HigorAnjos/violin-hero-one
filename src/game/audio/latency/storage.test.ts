import { describe, expect, it } from 'vitest';
import {
  LATENCY_STORAGE_KEY,
  audioDeviceKey,
  clearLatency,
  latencySeconds,
  latencyToMs,
  latestLatency,
  loadLatency,
  msToLatency,
  saveLatency,
} from './storage';
import { DEFAULT_DEVICE_KEY, DEFAULT_LATENCY_SECONDS } from './types';

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

const throwing = {
  getItem() {
    throw new DOMException('negado', 'SecurityError');
  },
  setItem() {
    throw new DOMException('cheio', 'QuotaExceededError');
  },
  removeItem() {
    throw new DOMException('negado', 'SecurityError');
  },
} as unknown as Storage;

const entry = { latencySeconds: 0.0875, confidence: 0.9, measuredAt: '2026-10-25T12:00:00.000Z' };

function streamWith(deviceId?: string): MediaStream {
  return { getAudioTracks: () => [{ getSettings: () => ({ deviceId }) }] } as unknown as MediaStream;
}

describe('armazenamento da latência', () => {
  it('grava e lê de volta por dispositivo', () => {
    const storage = new MemoryStorage();
    expect(saveLatency(entry, 'mic-a>fone', storage)).toBe(true);
    expect(saveLatency({ ...entry, latencySeconds: 0.2 }, 'mic-b>default', storage)).toBe(true);
    expect(loadLatency('mic-a>fone', storage)).toEqual(entry);
    expect(latencySeconds('mic-a>fone', storage)).toBeCloseTo(0.0875);
    expect(latencySeconds('mic-b>default', storage)).toBeCloseTo(0.2);
  });

  it('sem calibração, devolve null e a latência padrão', () => {
    const storage = new MemoryStorage();
    expect(loadLatency(DEFAULT_DEVICE_KEY, storage)).toBeNull();
    expect(latencySeconds('outro', storage)).toBe(DEFAULT_LATENCY_SECONDS);
  });

  it('ignora valores corrompidos ou fora da faixa', () => {
    const storage = new MemoryStorage();
    storage.setItem(LATENCY_STORAGE_KEY, '{oops');
    expect(loadLatency(DEFAULT_DEVICE_KEY, storage)).toBeNull();
    storage.setItem(LATENCY_STORAGE_KEY, JSON.stringify({ default: { latencySeconds: 'x', confidence: 1 } }));
    expect(loadLatency(DEFAULT_DEVICE_KEY, storage)).toBeNull();
    storage.setItem(LATENCY_STORAGE_KEY, JSON.stringify({ default: { latencySeconds: 2, confidence: 1 } }));
    expect(loadLatency(DEFAULT_DEVICE_KEY, storage)).toBeNull();
    storage.setItem(LATENCY_STORAGE_KEY, JSON.stringify([1, 2]));
    expect(loadLatency(DEFAULT_DEVICE_KEY, storage)).toBeNull();
    expect(saveLatency({ ...entry, latencySeconds: -0.01 }, DEFAULT_DEVICE_KEY, storage)).toBe(false);
    expect(saveLatency({ ...entry, latencySeconds: Number.NaN }, DEFAULT_DEVICE_KEY, storage)).toBe(false);
  });

  it('apaga um dispositivo ou todos', () => {
    const storage = new MemoryStorage();
    saveLatency(entry, 'a', storage);
    saveLatency(entry, 'b', storage);
    clearLatency('a', storage);
    expect(loadLatency('a', storage)).toBeNull();
    expect(loadLatency('b', storage)).toEqual(entry);
    clearLatency(undefined, storage);
    expect(storage.getItem(LATENCY_STORAGE_KEY)).toBeNull();
  });

  it('sobrevive a armazenamento que lança ou não existe', () => {
    expect(loadLatency(DEFAULT_DEVICE_KEY, throwing)).toBeNull();
    expect(latencySeconds(DEFAULT_DEVICE_KEY, throwing)).toBe(DEFAULT_LATENCY_SECONDS);
    expect(saveLatency(entry, DEFAULT_DEVICE_KEY, throwing)).toBe(false);
    expect(() => clearLatency(undefined, throwing)).not.toThrow();
    expect(() => clearLatency('a', throwing)).not.toThrow();
  });
});

describe('audioDeviceKey', () => {
  it('combina o microfone da trilha com a saída do contexto', () => {
    const context = { sinkId: 'fone-usb' } as unknown as BaseAudioContext;
    expect(audioDeviceKey(streamWith('mic-1'), context)).toBe('mic-1>fone-usb');
    expect(audioDeviceKey(streamWith('mic-1'))).toBe('mic-1>default');
    expect(audioDeviceKey(undefined, context)).toBe('default>fone-usb');
  });

  it('cai na chave padrão quando o navegador não diz nada', () => {
    expect(audioDeviceKey()).toBe(DEFAULT_DEVICE_KEY);
    expect(audioDeviceKey(streamWith(''), { sinkId: '' } as unknown as BaseAudioContext)).toBe(DEFAULT_DEVICE_KEY);
    expect(audioDeviceKey({} as MediaStream, { sinkId: { type: 'none' } } as unknown as BaseAudioContext)).toBe(
      DEFAULT_DEVICE_KEY,
    );
  });
});

describe('latestLatency', () => {
  it('a medida mais recente de qualquer par; nenhuma, null', () => {
    const storage = new MemoryStorage();
    expect(latestLatency(storage)).toBeNull();
    saveLatency(entry, 'a>b', storage);
    saveLatency({ ...entry, latencySeconds: 0.142, measuredAt: '2026-10-26T16:05:00.000Z' }, 'c>d', storage);
    saveLatency({ ...entry, measuredAt: '' }, 'e', storage);
    expect(latestLatency(storage)?.latencySeconds).toBe(0.142);
    expect(latestLatency(throwing)).toBeNull();
  });
});

describe('latencyToMs / msToLatency', () => {
  it('arredonda para ms inteiro dentro de 0..1000', () => {
    expect(latencyToMs(0.0875)).toBe(88);
    expect(latencyToMs(-0.02)).toBe(0);
    expect(latencyToMs(1.4)).toBe(1000);
    expect(() => latencyToMs(Number.NaN)).toThrow(RangeError);
  });

  it('volta do banco para segundos na mesma faixa', () => {
    expect(msToLatency(120)).toBeCloseTo(0.12);
    expect(msToLatency(5000)).toBe(1);
  });
});
