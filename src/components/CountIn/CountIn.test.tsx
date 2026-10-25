import { act, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { CountIn, useCountIn } from './CountIn';

const SONG = { bpm: 120, timeSignature: { beats: 4, unit: 4 as const } };

describe('useCountIn', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('anda um tempo a cada batida e avisa no fim, uma vez', () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useCountIn(SONG, onDone));
    expect(result.current.remaining).toBe(4);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.remaining).toBe(3);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.remaining).toBe(1);
    expect(onDone).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.done).toBe(true);
    act(() => vi.advanceTimersByTime(5000));
    expect(onDone).toHaveBeenCalledOnce();
  });
});

describe('CountIn', () => {
  it('número e bolinhas dizem a mesma coisa', () => {
    const { container } = renderScreen(<CountIn view={{ total: 4, beat: 2, remaining: 3, done: false }} bpm={112} />);
    expect(screen.getByRole('timer', { name: 'Começa em 3' })).toHaveTextContent('3');
    expect(screen.getByRole('img', { name: 'Compasso de entrada: tempo 2 de 4' })).toBeInTheDocument();
    expect(container.querySelectorAll('i[data-on]')).toHaveLength(2);
  });
});
