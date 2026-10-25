import React from 'react';

/** Celular deitado: a mesma quebra (altura até 500 px) que os estilos usam. */
export const COMPACT_QUERY = '(max-height: 500px)';

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      if (typeof matchMedia !== 'function') return () => undefined;
      const list = matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query]
  );
  return React.useSyncExternalStore(subscribe, () => typeof matchMedia === 'function' && matchMedia(query).matches, () => false);
}
