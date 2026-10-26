import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { renderScreen } from '../../shell/testing';
import type { RadioProps } from '../RadioGroup/useRadioGroup';
import { ModeCard } from './ModeCard';

const radio = (checked: boolean): RadioProps => ({
  role: 'radio',
  'aria-checked': checked,
  tabIndex: checked ? 0 : -1,
  ref: () => undefined,
  onClick: vi.fn(),
  onKeyDown: vi.fn(),
});

describe('ModeCard', () => {
  it('marcado mostra "Selecionado"; Enter confirma, outras teclas vão para o radiogroup', async () => {
    const onConfirm = vi.fn();
    const props = radio(true);
    renderScreen(<ModeCard art="arcade" name="Arcade" description="Pista" audience="Todos" radio={props} onConfirm={onConfirm} />);
    const card = screen.getByRole('radio', { name: 'Arcade' });
    expect(card).toHaveTextContent('Selecionado');
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalledOnce();
    await userEvent.keyboard('{ArrowRight}');
    expect(props.onKeyDown).toHaveBeenCalled();
  });

  it('sem radio: "Em breve", desabilitado e sem confirmar', async () => {
    const onConfirm = vi.fn();
    renderScreen(<ModeCard art="strings3d" name="Cordas 3D" description="3D" audience="Todos" onConfirm={onConfirm} />, { theme: palcoTheme });
    const card = screen.getByRole('radio', { name: 'Cordas 3D, em breve' });
    expect(card).toHaveAttribute('aria-disabled', 'true');
    card.focus();
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
