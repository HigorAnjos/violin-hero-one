import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import { UpdateNotice } from './UpdateNotice';

describe('UpdateNotice', () => {
  it('anuncia a versão nova e oferece atualizar ou deixar para depois', async () => {
    const onUpdate = vi.fn();
    const onLater = vi.fn();
    renderScreen(<UpdateNotice onUpdate={onUpdate} onLater={onLater} />, { theme: palcoTheme });
    expect(screen.getByRole('status')).toHaveTextContent('Nova versão do Violin Hero');
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onLater).toHaveBeenCalledOnce();
  });
});
