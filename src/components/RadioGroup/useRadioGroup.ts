import React from 'react';

export interface RadioProps {
  role: 'radio';
  'aria-checked': boolean;
  tabIndex: number;
  ref: (el: HTMLElement | null) => void;
  onClick: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}

const NEXT = new Set(['ArrowRight', 'ArrowDown']);
const PREVIOUS = new Set(['ArrowLeft', 'ArrowUp']);

/**
 * Teclado do radiogroup (padrão WAI-ARIA): só a opção marcada entra no Tab; setas andam e marcam.
 * Sem nada marcado, a primeira recebe o foco.
 */
export function useRadioGroup<T extends string>(values: readonly T[], value: T | null, onChange: (value: T) => void) {
  const refs = React.useRef(new Map<T, HTMLElement>());
  const focusable = value ?? values[0];

  return (option: T): RadioProps => ({
    role: 'radio' as const,
    'aria-checked': option === value,
    tabIndex: option === focusable ? 0 : -1,
    ref: (el: HTMLElement | null) => {
      if (el) refs.current.set(option, el);
      else refs.current.delete(option);
    },
    onClick: () => onChange(option),
    onKeyDown: (event: React.KeyboardEvent) => {
      const step = NEXT.has(event.key) ? 1 : PREVIOUS.has(event.key) ? -1 : 0;
      if (event.key === ' ') {
        event.preventDefault();
        onChange(option);
        return;
      }
      if (!step) return;
      event.preventDefault();
      const next = values[(values.indexOf(option) + step + values.length) % values.length];
      onChange(next);
      refs.current.get(next)?.focus();
    },
  });
}
