import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { liveLevelLabel, MicTroubleCard } from './MicTroubleCard';

describe('liveLevelLabel', () => {
  it('traduz o nível em palavra', () => {
    expect(liveLevelLabel(0)).toBe('sem sinal');
    expect(liveLevelLabel(0.05)).toBe('quase nada');
    expect(liveLevelLabel(0.4)).toBe('bom');
    expect(liveLevelLabel(0.9)).toBe('alto');
  });
});

describe('MicTroubleCard', () => {
  it.each([
    ['no-sound', 'Não estou te ouvindo', 'quase nada', 1],
    ['noisy', 'Tem muito barulho por aí', 'alto o tempo todo', 27],
    ['blocked', 'O microfone foi bloqueado', 'sem sinal', 0],
  ] as const)('%s: título, nível típico e barras acesas', (problem, title, label, lit) => {
    const { container } = renderScreen(<MicTroubleCard problem={problem} level={null} actions={null} />, { theme: palcoTheme });
    expect(screen.getByRole('alertdialog', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: `Nível do microfone: ${label}` })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-on]')).toHaveLength(lit);
  });

  it('mensagem de estado substitui a espera padrão', () => {
    renderScreen(<MicTroubleCard problem="blocked" level={null} status="Ainda bloqueado." actions={null} />);
    expect(screen.getByRole('status')).toHaveTextContent('Ainda bloqueado.');
  });
});
