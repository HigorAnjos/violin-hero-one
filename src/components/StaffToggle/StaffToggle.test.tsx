import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderScreen } from '../../shell/testing';
import { StaffToggle } from './StaffToggle';

describe('StaffToggle', () => {
  it('pauta escondida: "Pauta", não pressionado, e o toque pede para ligar', async () => {
    const onToggle = vi.fn();
    renderScreen(<StaffToggle pressed={false} onToggle={onToggle} />);
    const button = screen.getByRole('button', { name: 'Pauta', pressed: false });
    await userEvent.click(button);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('pauta visível: o mesmo nome, pressionado, e o toque pede para desligar', async () => {
    const onToggle = vi.fn();
    renderScreen(<StaffToggle pressed onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pauta', pressed: true }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it('na Partitura, o mesmo botão para o painel', () => {
    renderScreen(<StaffToggle kind="panel" pressed onToggle={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Painel', pressed: true })).toBeInTheDocument();
  });

  it('pelo teclado também', async () => {
    const onToggle = vi.fn();
    renderScreen(<StaffToggle pressed={false} onToggle={onToggle} />);
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Pauta' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onToggle).toHaveBeenCalledWith(true);
  });
});
