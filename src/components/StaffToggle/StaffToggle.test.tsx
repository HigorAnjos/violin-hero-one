import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { StaffToggle } from './StaffToggle';

describe('StaffToggle', () => {
  it('pauta escondida: "Mostrar pauta", desligado, e o toque pede para ligar', async () => {
    const onToggle = vi.fn();
    renderScreen(<StaffToggle pressed={false} onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: 'Mostrar pauta' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).toHaveTextContent('Pauta');
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('pauta visível: "Esconder pauta", ligado, e o toque pede para desligar', async () => {
    const onToggle = vi.fn();
    renderScreen(<StaffToggle pressed onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: 'Esconder pauta' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('na Partitura, o mesmo botão para o painel', () => {
    renderScreen(<StaffToggle kind="panel" pressed onToggle={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Esconder painel' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(button).toHaveTextContent('Painel');
  });

  it('pelo teclado também', async () => {
    const onToggle = vi.fn();
    renderScreen(<StaffToggle pressed={false} onToggle={onToggle} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Mostrar pauta' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
