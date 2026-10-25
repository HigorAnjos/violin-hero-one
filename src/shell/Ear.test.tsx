import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { EarProvider, micFailure, unwiredEar, useEar } from './Ear';
import { createFakeEar, reading } from './fakeEar';

describe('micFailure', () => {
  it.each([
    ['NotAllowedError', 'denied', 'blocked'],
    ['SecurityError', 'insecure', 'blocked'],
    ['NotSupportedError', 'unsupported', 'blocked'],
    ['InvalidStateError', 'audio-blocked', 'blocked'],
    ['NotFoundError', 'no-device', 'no-sound'],
    ['NotReadableError', 'in-use', 'no-sound'],
    ['QualquerOutro', 'unknown', 'no-sound'],
  ])('%s: causa %s, tela %s', (name, cause, problem) => {
    expect(micFailure(new DOMException('x', name))).toEqual({ cause, problem });
  });
});

describe('useEar', () => {
  it('sem provider, recusa com NotSupportedError', async () => {
    const { result } = renderHook(() => useEar());
    expect(result.current).toBe(unwiredEar);
    await expect(result.current.start()).rejects.toMatchObject({ name: 'NotSupportedError' });
  });

  it('entrega o Ouvido injetado e repassa leituras até cancelar', () => {
    const ear = createFakeEar();
    const { result } = renderHook(() => useEar(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <EarProvider ear={ear}>{children}</EarProvider>,
    });
    const listener = vi.fn();
    const off = result.current.onPitch(listener);
    ear.pitch(reading(69, 1));
    off();
    ear.pitch(reading(69, 2));
    expect(listener).toHaveBeenCalledOnce();
  });
});
