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

  it('sem onSpeed nem onMetronome, sem esses controles', () => {
    renderScreen(<PauseMenu {...props()} />);
    expect(screen.queryByRole('group', { name: 'Velocidade da música' })).not.toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: /metrônomo/ })).not.toBeInTheDocument();
  });

  it('na partida comum, mudar a velocidade avisa que vira prática; Cancelar não muda nada', async () => {
    const onSpeed = vi.fn();
    renderScreen(<PauseMenu {...props({ speed: 1, onSpeed, speedNeedsConfirm: true })} />);
    expect(screen.getByRole('button', { name: '100%' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: '70%' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('A partir daqui, esta partida conta como prática: sem selos e sem recorde.');
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSpeed).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '70%' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onSpeed).toHaveBeenCalledWith(0.7);
  });

  it('já em prática, a velocidade muda direto', async () => {
    const onSpeed = vi.fn();
    renderScreen(<PauseMenu {...props({ speed: 0.7, onSpeed })} />);
    await userEvent.click(screen.getByRole('button', { name: '100%' }));
    expect(onSpeed).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('volume do metrônomo; 0 é desligado', () => {
    const onMetronome = vi.fn();
    renderScreen(<PauseMenu {...props({ metronome: 0, onMetronome })} />);
    expect(screen.getByText('desligado')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('slider', { name: /Volume do metrônomo/ }), { target: { value: '40' } });
    expect(onMetronome).toHaveBeenCalledWith(0.4);
  });
});
