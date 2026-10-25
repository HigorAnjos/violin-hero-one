import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { litSegments, SegmentMeter } from './SegmentMeter';

describe('litSegments', () => {
  it('arredonda e respeita os limites', () => {
    expect(litSegments(0, 12)).toBe(0);
    expect(litSegments(Number.NaN, 12)).toBe(0);
    expect(litSegments(0.66, 12)).toBe(8);
    expect(litSegments(2, 12)).toBe(12);
  });
});

describe('SegmentMeter', () => {
  it('lê o sentido pelo rótulo e acende a fração pedida', () => {
    const { container } = renderScreen(<SegmentMeter fraction={0.5} count={10} label="Volume bom, 5 de 10" />);
    expect(screen.getByRole('img', { name: 'Volume bom, 5 de 10' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-on]')).toHaveLength(5);
  });
});
