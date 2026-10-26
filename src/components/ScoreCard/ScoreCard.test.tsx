import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { formatPercent, formatPoints, orchestraHint, ScoreCard } from './ScoreCard';

describe('ScoreCard', () => {
  it('números em pt-BR', () => {
    expect(formatPoints(1284560)).toBe('1.284.560');
    expect(formatPercent(98.4)).toBe('98,4%');
  });

  it('o que falta para o próximo naipe', () => {
    expect(orchestraHint(3, 0)).toBe('A percussão entra em 12 acertos seguidos');
    expect(orchestraHint(3, 9)).toBe('A percussão entra em 3 acertos seguidos');
    expect(orchestraHint(4, 30)).toBe('Orquestra completa tocando com você');
  });

  it('placar e naipes acesos pelo nível', () => {
    const { container } = renderScreen(<ScoreCard score={1284560} multiplier={4} combo={128} accuracy={98.4} level={3} />);
    expect(screen.getByText('1.284.560')).toBeInTheDocument();
    expect(screen.getByLabelText('multiplicador 4 vezes')).toHaveTextContent('×4');
    expect(screen.getByText(/98,4% de acertos/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^cordas, madeiras e metais tocando/ })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-on]')).toHaveLength(3);
  });

  it('sem a faixa dos naipes quando a tela pede (Cordas 3D)', () => {
    renderScreen(<ScoreCard score={10} multiplier={1} combo={0} accuracy={100} level={3} sections={false} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.queryByText('Orquestra tocando com você')).not.toBeInTheDocument();
  });
});
