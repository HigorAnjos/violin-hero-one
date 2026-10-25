import React from 'react';
import styled from 'styled-components';

export type SegmentTone = 'primary' | 'info' | 'warning' | 'danger';

const Row = styled.div<{ $height: string; $gap: string }>`
  display: flex;
  gap: ${({ $gap }) => $gap};
  height: ${({ $height }) => $height};
`;

const Segment = styled.i<{ $tone: SegmentTone | null; $round: boolean }>`
  flex: 1;
  border-radius: ${({ $round }) => ($round ? '3px' : '0')};
  background-color: ${({ theme, $tone }) => {
    if (!$tone) return theme.colors.surfaceBorder;
    if ($tone === 'primary') return theme.colors.primary.main;
    return theme.colors[$tone].main;
  }};
`;

/** Quantos segmentos acendem para uma fração de 0 a 1 (arredonda para o mais próximo). */
export function litSegments(fraction: number, count: number): number {
  if (!(fraction > 0)) return 0;
  return Math.min(count, Math.round(fraction * count));
}

/**
 * Medidor em segmentos (.ns-segs do design). O sentido vai no `label` (lido como imagem); a cor
 * de cada segmento aceso vem de `toneAt`, para faixas como verde/amarelo/vermelho.
 */
export const SegmentMeter: React.FC<{
  fraction: number;
  count: number;
  label: string;
  toneAt?: (index: number) => SegmentTone;
  height?: string;
  gap?: string;
  round?: boolean;
  className?: string;
}> = ({ fraction, count, label, toneAt = () => 'primary', height = '0.625rem', gap = '0.25rem', round = false, className }) => {
  const lit = litSegments(fraction, count);
  return (
    <Row role="img" aria-label={label} $height={height} $gap={gap} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <Segment key={i} $tone={i < lit ? toneAt(i) : null} $round={round} data-on={i < lit || undefined} />
      ))}
    </Row>
  );
};
