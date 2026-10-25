import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { PauseMenu, type PauseMenuProps } from './PauseMenu';

const props = (extra: Partial<PauseMenuProps> = {}): PauseMenuProps => ({
  subtitle: 'Ode à Alegria · Fácil',
  elapsed: 102,
  total: 192,
  volume: 0.7,
  onVolume: vi.fn(),
  onContinue: vi.fn(),
  onRestart: vi.fn(),
  onRetune: vi.fn(),
  onExit: vi.fn(),
  counting: null,
  ...extra,
});

describe('PauseMenu', () => {
  it('diálogo com foco em Continuar e as quatro saídas', async () => {
    const p = props();
    renderScreen(<PauseMenu {...p} />);
    expect(screen.getByRole('dialog', { name: 'PAUSADO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar música' }));
    await userEvent.click(screen.getByRole('button', { name: 'Afinar de novo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sair para músicas' }));
    expect(p.onRestart).toHaveBeenCalled();
    expect(p.onRetune).toHaveBeenCalled();
    expect(p.onExit).toHaveBeenCalled();
    expect(screen.getByText('1:42')).toBeInTheDocument();
  });

  it('volume da orquestra no ajuste rápido', () => {
    const p = props();
    renderScreen(<PauseMenu {...p} />);
    expect(screen.getByText('70%')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: /Volume da orquestra/ }), { target: { value: '40' } });
    expect(p.onVolume).toHaveBeenCalledWith(0.4);
  });

  it('contagem de volta e aviso do microfone fechado', () => {
    const { unmount } = renderScreen(<PauseMenu {...props({ micClosed: true })} />);
    expect(screen.getByText(/O microfone fechou/)).toBeInTheDocument();
    unmount();
    renderScreen(<PauseMenu {...props({ counting: 3 })} />);
    expect(screen.getByRole('timer')).toHaveTextContent('3');
  });
});
