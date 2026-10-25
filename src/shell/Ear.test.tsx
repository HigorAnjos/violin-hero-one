import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { EarProvider, micProblemFromError, unwiredEar, useEar } from './Ear';
import { createFakeEar, reading } from './fakeEar';

describe('micProblemFromError', () => {
  it('permissão negada, página sem HTTPS ou navegador sem microfone: bloqueado', () => {
    for (const name of ['NotAllowedError', 'SecurityError', 'NotSupportedError']) {
      expect(micProblemFromError(new DOMException('x', name))).toBe('blocked');
    }
  });

  it('sem microfone achado ou em uso por outro app: não estou te ouvindo', () => {
    expect(micProblemFromError(new DOMException('x', 'NotFoundError'))).toBe('no-sound');
    expect(micProblemFromError(new DOMException('x', 'NotReadableError'))).toBe('no-sound');
    expect(micProblemFromError('qualquer coisa')).toBe('no-sound');
  });
});

describe('useEar', () => {
  it('sem provider, o Ouvido ainda não ligado recusa com NotSupportedError', async () => {
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
