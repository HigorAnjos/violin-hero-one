import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { createEditor, editorSong, insertNote } from '../../game/notation/editor';
import { previewWindow, TrackPreview } from './TrackPreview';

const scale = () => editorSong([62, 64, 66, 67, 69, 71, 73, 74, 76].reduce((s, m) => insertNote(s, m), createEditor()));

describe('TrackPreview', () => {
  it('mostra o compasso do cursor e o seguinte', () => {
    const window = previewWindow(scale(), 5);
    expect(window.first).toBe(1);
    expect(window.span).toBe(8);
    expect(window.notes.map((n) => n.at)).toEqual([0, 1, 2, 3, 4]);
  });

  it('cada nota na raia da corda, na cor dela', () => {
    render(
      <ThemeProvider theme={cadernoTheme}>
        <TrackPreview song={scale()} cursor={0} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('img', { name: 'Prévia na pista: compassos 1 e 2' })).toBeInTheDocument();
    const notes = screen.getAllByTestId('previa-nota');
    expect(notes).toHaveLength(8);
    expect(notes[0]).toHaveAttribute('fill', cadernoTheme.game.strings.D.main);
    expect(notes[4]).toHaveAttribute('fill', cadernoTheme.game.strings.A.main);
  });
});
