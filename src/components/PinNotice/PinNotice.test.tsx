import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { PinNotice } from './PinNotice';

describe('PinNotice', () => {
  it('mostra o PIN uma vez, avisa para anotar e fecha só com a confirmação (ou Esc)', async () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider theme={cadernoTheme}>
        <PinNotice name="Ana" pin="0427" onClose={onClose} />
      </ThemeProvider>
    );
    const dialog = screen.getByRole('alertdialog', { name: 'PIN de Ana' });
    expect(dialog).toHaveTextContent('0427');
    expect(dialog).toHaveTextContent('não aparece de novo');
    expect(screen.getByRole('button', { name: 'Anotei o PIN' })).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Anotei o PIN' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
