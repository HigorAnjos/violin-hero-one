import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../../assets/styles/themes/palco';
import { levelSettings } from '../../game/engine/levels';
import { FIXED_SONGS } from '../../game/notation/songs';
import { EMBEDDED_SHELF } from '../../services/shelf';
import { SongError } from '../../services/songs';
import { renderScreen } from '../../shell/testing';
import { SongDetails } from './SongDetails';

const SONG = { ...EMBEDDED_SHELF[0], levels: ['easy', 'medium'] as ('easy' | 'medium')[] };

describe('SongDetails', () => {
  it('ficha, cordas em % e a folga do nível', () => {
    renderScreen(
      <SongDetails song={SONG} level="easy" onLevel={vi.fn()} playable={{ status: 'ready', song: FIXED_SONGS[0].song, embedded: true }} settings={levelSettings('never')} actions={null} />,
      { theme: palcoTheme }
    );
    expect(screen.getByRole('heading', { name: SONG.title })).toBeInTheDocument();
    expect(screen.getByText(/Ré maior · 60 BPM/)).toBeInTheDocument();
    expect(screen.getByText(/\d+ notas/)).toBeInTheDocument();
    expect(screen.getByText(`Afinação ±${levelSettings('never').toleranceCents} ¢ · tempo ±${levelSettings('never').windows.good} ms`)).toBeInTheDocument();
  });

  it('nível que a música não tem fica desabilitado; trocar avisa a tela', async () => {
    const onLevel = vi.fn();
    renderScreen(<SongDetails song={SONG} level="easy" onLevel={onLevel} playable={{ status: 'loading' }} settings={levelSettings('beginner')} actions={null} />);
    expect(screen.getByRole('button', { name: 'Difícil' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Médio' }));
    expect(onLevel).toHaveBeenCalledWith('medium');
    expect(screen.queryByText(/notas/)).not.toBeInTheDocument();
  });

  it('erro ao baixar a partitura aparece no painel', () => {
    renderScreen(
      <SongDetails song={SONG} level="medium" onLevel={vi.fn()} playable={{ status: 'error', error: new SongError('offline'), retry: vi.fn() }} settings={levelSettings('beginner')} actions={null} />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
  });
});
