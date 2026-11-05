import { vi } from 'vitest';
import { COMPACT_QUERY } from './useMediaQuery';

/**
 * Só para testes: a janela de um celular deitado (844×390 por padrão), com o COMPACT_QUERY valendo. Desfaz com
 * vi.unstubAllGlobals().
 */
export function stubLandscapePhone(width = 844, height = 390) {
  vi.stubGlobal('innerWidth', width);
  vi.stubGlobal('innerHeight', height);
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query === COMPACT_QUERY, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }))
  );
}
