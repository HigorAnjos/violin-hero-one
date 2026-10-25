import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { SONG_FORMAT_VERSION, type Song } from '../game/notation/song';
import { WARM_UP_SONG } from '../shell/firstSong';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Countdown, countdownDetails, type CountdownState } from './Countdown';

const CANON: Song = {
  formatVersion: SONG_FORMAT_VERSION,
  id: 'canon',
  title: 'Canon em Neon',
  composer: 'Pachelbel',
  key: 'D major',
  bpm: 112,
  timeSignature: { beats: 4, unit: 4 },
  level: 'medium',
  measures: [{ beats: 4, notes: [{ beat: 0, beats: 2, midi: 62, string: 1, finger: 0 }] }],
};

const renderCountdown = (state?: CountdownState) => renderScreen(<Countdown />, { path: ROUTES.countdown, route: ROUTES.countdown, state, theme: palcoTheme });

describe('countdownDetails', () => {
  it('só fala da latência quando ela foi calibrada', () => {
    expect(countdownDetails(CANON, 142)).toBe('1 compasso de entrada · 112 BPM · latência 142 ms descontada');
    expect(countdownDetails(CANON)).toBe('1 compasso de entrada · 112 BPM');
  });
});

describe('Countdown', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mostra música, modo, nível e a primeira nota', () => {
    renderCountdown({ song: CANON, mode: 'Arcade', latencyMs: 142, next: '/jogar' });
    expect(screen.getByText('Canon em Neon · Arcade · Médio')).toBeInTheDocument();
    expect(screen.getByRole('timer', { name: 'Começa em 4' })).toBeInTheDocument();
    expect(screen.getByText('Levante o arco')).toBeInTheDocument();
    expect(screen.getByText('Ré4')).toBeInTheDocument();
    expect(screen.getByText('corda Ré solta')).toBeInTheDocument();
    expect(screen.getByText('1 compasso de entrada · 112 BPM · latência 142 ms descontada')).toBeInTheDocument();
  });

  it('conta um compasso no andamento da música e segue para o jogo', () => {
    renderCountdown({ song: CANON, next: '/jogar' });
    const beatMs = 60000 / CANON.bpm;
    act(() => vi.advanceTimersByTime(beatMs));
    expect(screen.getByRole('timer', { name: 'Começa em 3' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Compasso de entrada: tempo 2 de 4' })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(beatMs * 3));
    expect(screen.getByTestId('location')).toHaveTextContent('/jogar');
  });

  it('sem música escolhida, usa o aquecimento de cordas soltas; pular vai direto', () => {
    renderCountdown();
    expect(screen.getByText(`${WARM_UP_SONG.title} · Arcade · Fácil`)).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: /Pular contagem/ }).click());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('destino de fora do jogo é ignorado', () => {
    renderCountdown({ next: 'https://mal.com' });
    act(() => screen.getByRole('button', { name: /Pular contagem/ }).click());
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
