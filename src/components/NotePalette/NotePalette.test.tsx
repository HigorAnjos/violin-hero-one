import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { NotePalette } from './NotePalette';

function renderPalette(props: Partial<React.ComponentProps<typeof NotePalette>> = {}) {
  const onAction = vi.fn();
  render(
    <ThemeProvider theme={cadernoTheme}>
      <NotePalette duration={1} dotted={false} canUndo canRedo={false} onAction={onAction} {...props} />
    </ThemeProvider>,
  );
  return onAction;
}

describe('NotePalette', () => {
  it('a figura escolhida e o ponto aparecem apertados', () => {
    renderPalette({ duration: 0.5, dotted: true });
    expect(screen.getByRole('button', { name: 'Colcheia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Semínima' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Ponto de aumento' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('cada ferramenta vira uma ação do editor', async () => {
    const onAction = renderPalette();
    await userEvent.click(screen.getByRole('button', { name: 'Mínima' }));
    await userEvent.click(screen.getByRole('button', { name: 'Pausa' }));
    await userEvent.click(screen.getByRole('button', { name: 'Bemol' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ligadura' }));
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    expect(onAction.mock.calls.map(([a]) => a)).toEqual([
      { type: 'duration', duration: 2 },
      { type: 'rest' },
      { type: 'accidental', accidental: 'flat' },
      { type: 'tie' },
      { type: 'undo' },
    ]);
  });

  it('sem o que refazer, o botão fica desligado', () => {
    renderPalette();
    expect(screen.getByRole('button', { name: 'Refazer' })).toBeDisabled();
    expect(screen.getByRole('toolbar', { name: 'Ferramentas de nota' })).toBeInTheDocument();
  });
});
