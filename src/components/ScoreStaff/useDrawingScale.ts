import React from 'react';

/**
 * Pixels de tela por unidade do viewBox do desenho (`viewWidth` de largura): o SVG encolhe com a tela, e o texto dele
 * precisa crescer no viewBox para não ficar abaixo de 12 px. Sem ResizeObserver (testes), 1.
 */
export function useDrawingScale(ref: React.RefObject<SVGSVGElement | null>, viewWidth: number): number {
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setScale(width / viewWidth);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, viewWidth]);
  return scale;
}
