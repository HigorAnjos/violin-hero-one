import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { NoteInspector, type InspectedNote } from './NoteInspector';

const NOTE: InspectedNote = { name: 'Fá♯5', figure: 'semínima · 1 tempo', where: 'comp. 6 · tempo 3', string: 3, finger: 1, chosen: false, firstPosition: true };

function renderInspector(note: InspectedNote | null) {
  const onAction = vi.fn();
  render(
    <ThemeProvider theme={cadernoTheme}>
      <NoteInspector note={note} onAction={onAction} />
    </ThemeProvider>,
  );
  return onAction;
}

describe('NoteInspector', () => {
  it('mostra nome, figura, onde está e a corda e o dedo sugeridos', () => {
    renderInspector(NOTE);
    const panel = screen.getByRole('region', { name: 'Nota selecionada' });
    expect(panel).toHaveTextContent('Fá♯5');
    expect(panel).toHaveTextContent('comp. 6 · tempo 3');
    expect(within(screen.getByRole('group', { name: 'Corda' })).getByRole('button', { name: 'Mi' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Dedo 1' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Mi' })).toHaveStyle({ backgroundColor: cadernoTheme.game.strings.E.main });
    expect(panel).toHaveTextContent('Sugerido pelo app (1ª posição)');
  });

  it('trocar corda e dedo; com escolha feita, volta ao sugerido', async () => {
    const onAction = renderInspector({ ...NOTE, chosen: true });
    await userEvent.click(screen.getByRole('button', { name: 'Lá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Corda solta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voltar ao sugerido' }));
    expect(onAction.mock.calls.map(([a]) => a)).toEqual([{ type: 'string', string: 2 }, { type: 'finger', finger: 0 }, { type: 'suggested' }]);
  });

  it('sem nota no cursor, diz como escrever', () => {
    renderInspector(null);
    expect(screen.getByText(/Toque na pauta ou use as letras A a G/)).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Corda' })).not.toBeInTheDocument();
  });
});
