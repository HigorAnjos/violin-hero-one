import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceData, setDeviceData, type DeviceData } from './deviceData';

afterEach(() => setDeviceData(null));

describe('deviceData', () => {
  it('sem sincronização: nada pendente e trocar de usuário não falha', async () => {
    await expect(deviceData().flush('u1')).resolves.toBeUndefined();
    await expect(deviceData().forget('u1')).resolves.toBeUndefined();
    expect(() => deviceData().use('u2')).not.toThrow();
    expect(await deviceData().pending('u1')).toBe(0);
  });

  it('a implementação registrada é a que a conta chama; null volta ao vazio', async () => {
    const sync: DeviceData = { flush: vi.fn(), forget: vi.fn(), use: vi.fn(), pending: vi.fn().mockResolvedValue(3) };
    setDeviceData(sync);
    expect(await deviceData().pending('u1')).toBe(3);
    setDeviceData(null);
    expect(await deviceData().pending('u1')).toBe(0);
  });
});
