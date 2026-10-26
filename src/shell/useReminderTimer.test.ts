import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveReminder } from '../services/reminder';
import { REMINDER_CHANGED, useReminderTimer } from './useReminderTimer';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 26, 19, 0));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useReminderTimer', () => {
  it('com o app aberto, mostra o lembrete na hora escolhida e só quando ligado', async () => {
    const Fake = Object.assign(vi.fn(), { permission: 'granted' });
    vi.stubGlobal('Notification', Fake);
    renderHook(() => useReminderTimer());
    await act(async () => vi.advanceTimersByTimeAsync(60 * 60 * 1000));
    expect(Fake).not.toHaveBeenCalled();

    saveReminder({ enabled: true, time: '20:30', days: [1] });
    act(() => void dispatchEvent(new Event(REMINDER_CHANGED)));
    await act(async () => vi.advanceTimersByTimeAsync(29 * 60 * 1000));
    expect(Fake).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2 * 60 * 1000));
    expect(Fake).toHaveBeenCalledWith('Hora do violino', expect.objectContaining({ body: expect.stringContaining('5 minutos') }));
  });
});
