import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { saveLatency } from '../game/audio';
import { loadOrchestraSettings } from '../game/synth';
import { loadA4 } from '../services/playerAudio';
import { loadMetronome } from '../shell/metronome';
import { loadPlayPrefs } from '../shell/playPrefs';
import { ROUTES } from '../shell/routes';
import { LocationProbe } from '../shell/testing';
import { ThemeChoiceProvider } from '../shell/ThemeChoice';
import { measuredWhen, Settings } from './Settings';

function renderSettings(path: string = ROUTES.settings) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThemeChoiceProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={ROUTES.settings} element={<Settings />} />
            <Route path="*" element={null} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ThemeChoiceProvider>
    </QueryClientProvider>
  );
}

afterEach(() => localStorage.clear());

describe('Settings', () => {
  it('abre em Áudio e latência, com as seções no menu', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: 'Configurações' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Seções de configuração' });
    expect(within(nav).getByRole('link', { name: 'Áudio e latência' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Jogo', 'Visual', 'Acessibilidade', 'Lembrete de prática', 'Perfil']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Latência' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Afinação' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Som' })).toBeInTheDocument();
  });

  it('Lá: −/+ de 1 Hz, atalhos e limites 415–466, guardado no aparelho', async () => {
    renderSettings();
    expect(screen.getByText('442 Hz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '442' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar 1 Hz' }));
    expect(loadA4()).toBe(443);
    await userEvent.click(screen.getByRole('button', { name: '415' }));
    expect(screen.getByText('415 Hz')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diminuir 1 Hz' })).toBeDisabled();
    expect(loadA4()).toBe(415);
  });

  it('latência medida e "Medir de novo" leva à calibração', async () => {
    saveLatency({ latencySeconds: 0.142, confidence: 0.9, measuredAt: new Date().toISOString() });
    renderSettings();
    expect(screen.getByText('142 ms')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Medir de novo' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.calibration);
  });

  it('sem medida: convida a medir', () => {
    renderSettings();
    expect(screen.getByText('Ainda não medida neste aparelho')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Medir' })).toBeInTheDocument();
  });

  it('orquestra: liga/desliga, volume e fone; metrônomo', async () => {
    renderSettings();
    fireEvent.change(screen.getByRole('slider', { name: 'Volume da orquestra' }), { target: { value: '80' } });
    expect(loadOrchestraSettings().volume).toBe(0.8);
    await userEvent.click(screen.getByRole('switch', { name: /Estou de fone/ }));
    expect(loadOrchestraSettings().headphones).toBe(true);
    await userEvent.click(screen.getByRole('switch', { name: /Tocar com a orquestra/ }));
    expect(loadOrchestraSettings().enabled).toBe(false);
    expect(screen.queryByRole('slider', { name: 'Volume da orquestra' })).not.toBeInTheDocument();
    const metronome = screen.getByRole('slider', { name: /Metrônomo/ });
    expect(metronome).toHaveAttribute('aria-valuetext', 'desligado');
    fireEvent.change(metronome, { target: { value: '40' } });
    expect(loadMetronome()).toBe(0.4);
  });

  it('Jogo: linha de afinação e nome das notas', async () => {
    renderSettings(`${ROUTES.settings}?secao=jogo`);
    await userEvent.click(screen.getByRole('switch', { name: /Mostrar linha de afinação/ }));
    await userEvent.click(screen.getByRole('switch', { name: /Mostrar nome das notas/ }));
    expect(loadPlayPrefs()).toMatchObject({ tuningLine: false, noteNames: true });
  });

  it('Acessibilidade: padrões para daltonismo', async () => {
    renderSettings(`${ROUTES.settings}?secao=acessibilidade`);
    await userEvent.click(screen.getByRole('switch', { name: /Padrões para daltonismo/ }));
    expect(loadPlayPrefs().colorblind).toBe(true);
  });

  it('Visual: seletor de temas; seção desconhecida cai no Áudio', async () => {
    const { unmount } = renderSettings(`${ROUTES.settings}?secao=visual`);
    await userEvent.click(screen.getByRole('radio', { name: /Neon/ }));
    expect(document.documentElement.dataset.theme).toBe('neon');
    unmount();
    renderSettings(`${ROUTES.settings}?secao=xyz`);
    expect(screen.getByRole('region', { name: 'Latência' })).toBeInTheDocument();
  });

  it('data da medida: hoje com hora; outro dia com a data', () => {
    const now = new Date(2026, 9, 26, 18, 0);
    expect(measuredWhen(new Date(2026, 9, 26, 16, 5).toISOString(), now)).toBe('hoje 16:05');
    expect(measuredWhen(new Date(2026, 9, 9, 16, 5).toISOString(), now)).toMatch(/^9 de out/);
    expect(measuredWhen('')).toBe('');
  });
});
