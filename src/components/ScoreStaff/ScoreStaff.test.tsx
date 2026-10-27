import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it, vi } from 'vitest';
import { cadernoTheme, type Theme } from '../../assets/styles/themes';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { pixelTheme } from '../../assets/styles/themes/specials';
import { createEditor, editorSong, insertNote, setDuration, toggleTie } from '../../game/notation/editor';
import { ScoreStaff, staffLabel } from './ScoreStaff';
import { stepY, xAt } from './staffGeometry';

const SCALE = [62, 64, 66, 67, 69, 71, 73, 74];

function renderStaff(theme: Theme, onTap = vi.fn(), selectedAt: number | null = 7) {
  let state = SCALE.reduce((s, m) => insertNote(s, m), createEditor());
  state = toggleTie(setDuration(state, 0.5));
  const song = editorSong(state);
  const view = render(
    <ThemeProvider theme={theme}>
      <ScoreStaff song={song} cursor={state.cursor} selectedAt={selectedAt} onTap={onTap} />
    </ThemeProvider>,
  );
  return { ...view, song, onTap };
}

describe.each([
  ['Caderno', cadernoTheme],
  ['Palco', palcoTheme],
  ['8-Bits', pixelTheme],
] as [string, Theme][])('ScoreStaff no tema %s', (_name, theme) => {
  it('desenha cada nota com o dedo na cor da corda, a ligadura e o cursor', () => {
    const { container } = renderStaff(theme);
    const notes = screen.getAllByTestId('nota');
    expect(notes).toHaveLength(SCALE.length + 1);
    expect(notes.map((n) => n.querySelector('text:last-child')!.textContent)).toEqual(['0', '1', '2', '3', '0', '1', '2', '3', '3']);
    const dot = notes[0].querySelector('circle')!;
    expect(dot).toHaveAttribute('fill', theme.game.strings.D.main);
    expect(screen.getByTestId('cursor')).toHaveAttribute('stroke', theme.colors.primary.main);
    // 8-Bits: cabeça quadrada, como na pista
    expect(container.querySelectorAll('[data-testid="nota"] rect').length > 0).toBe(theme.game.noteShape === 'square');
  });

  it('a nota selecionada fica na cor de destaque do tema', () => {
    renderStaff(theme);
    const selected = screen.getAllByTestId('nota').filter((n) => n.dataset.selected);
    expect(selected).toHaveLength(1);
    expect(selected[0].querySelector('ellipse, rect')).toHaveAttribute('stroke', theme.colors.primary.main);
  });
});

describe('ScoreStaff', () => {
  it('tem nome para o leitor de tela com compassos e notas (a ligada não conta)', () => {
    const { song } = renderStaff(cadernoTheme);
    expect(screen.getByRole('img', { name: staffLabel(song) })).toBeInTheDocument();
    expect(staffLabel(song)).toBe('Partitura de 4 compassos, 8 notas');
  });

  it('colcheias do mesmo tempo saem ligadas por barra, sem bandeirinha; vizinhas apertadas revezam a altura do dedo', () => {
    const state = [62, 64, 66, 67].reduce((s, m) => insertNote(s, m), setDuration(createEditor(), 0.5));
    const { container } = render(
      <ThemeProvider theme={cadernoTheme}>
        <ScoreStaff song={editorSong(state)} cursor={state.cursor} selectedAt={null} onTap={vi.fn()} />
      </ThemeProvider>,
    );
    expect(container.querySelectorAll('[data-testid="nota"] path')).toHaveLength(0);
    expect(container.querySelectorAll('g[aria-hidden="true"] > line[stroke-width="5"]')).toHaveLength(2);
    const fingerYs = screen.getAllByTestId('nota').map((n) => Number(n.querySelector('circle')!.getAttribute('cy')));
    expect(new Set(fingerYs).size).toBe(2);
  });

  it('o toque vira tempo e grau na escala do viewBox', () => {
    const { container, onTap } = renderStaff(cadernoTheme);
    const svg = container.querySelector('svg')!;
    // Desenhada na metade do tamanho: o toque é dobrado de volta para o viewBox
    svg.getBoundingClientRect = () => ({ left: 10, top: 20, width: 424, height: 168, right: 434, bottom: 188, x: 10, y: 20, toJSON: () => null });
    const { x } = xAt(2, 4, 2);
    fireEvent.pointerUp(svg, { clientX: 10 + x / 2, clientY: 20 + stepY(31, 0) / 2 });
    expect(onTap).toHaveBeenCalledTimes(1);
    const [at, step] = onTap.mock.calls[0];
    expect(Math.round(at * 2) / 2).toBe(2);
    expect(step).toBe(31);
  });
});
