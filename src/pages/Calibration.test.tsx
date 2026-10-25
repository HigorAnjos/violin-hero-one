import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { loadA4 } from '../services/playerAudio';
import { createFakeEar, reading } from '../shell/fakeEar';
import { loadOrchestraSettings } from '../game/synth';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Calibration } from './Calibration';

const renderCalibration = (ear = createFakeEar(), theme = palcoTheme) => {
  renderScreen(<Calibration />, { ear, path: ROUTES.calibration, route: ROUTES.calibration, theme });
  return ear;
};

describe('Calibration', () => {
  afterEach(() => localStorage.clear());

  it('abre o microfone com o Lá do aparelho e mostra a corda que soa', async () => {
    localStorage.setItem('vh:a4', '440');
    const ear = renderCalibration();
    await waitFor(() => expect(ear.started).toBe(1));
    expect(ear.a4).toBe(440);
    act(() => ear.pitch(reading(69, 0, 0)));
    expect(screen.getByRole('heading', { name: 'Afine antes de tocar' })).toBeInTheDocument();
    expect(screen.getByText('A4')).toBeInTheDocument();
    expect(screen.getByText('● Ouvindo agora')).toBeInTheDocument();
  });

  it('o Lá de referência muda no Ouvido na hora', async () => {
    const ear = renderCalibration();
    await waitFor(() => expect(ear.started).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar 1 Hz' }));
    expect(ear.a4).toBe(443);
    await userEvent.click(screen.getByRole('button', { name: '415 barroco' }));
    expect(ear.a4).toBe(415);
    expect(screen.getByRole('button', { name: '415 barroco' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('"Está de fone?" liga a orquestra completa (headphones)', async () => {
    renderCalibration();
    await userEvent.click(screen.getByRole('radio', { name: 'Sim' }));
    expect(loadOrchestraSettings().headphones).toBe(true);
    expect(screen.getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'true');
  });

  it('sem medida para este par entrada>saída, sugere medir', async () => {
    renderCalibration();
    expect(await screen.findByText(/ainda não foi medido/)).toBeInTheDocument();
    expect(screen.getByText('PADRÃO')).toBeInTheDocument();
    expect(screen.getByText('100 ms')).toBeInTheDocument();
  });

  it('Começar guarda o Lá e vai para a contagem', async () => {
    const ear = renderCalibration();
    await waitFor(() => expect(ear.started).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir 1 Hz' }));
    await userEvent.click(screen.getByRole('button', { name: /Começar/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.countdown);
    expect(loadA4()).toBe(441);
  });

  it('microfone bloqueado vai para a tela de problema e volta para cá', async () => {
    const ear = createFakeEar();
    ear.failNextStart('NotAllowedError');
    renderCalibration(ear);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/microfone\/problema\?motivo=sem-permissao&depois=%2Fafinar/));
  });

  it('aba escondida fecha o microfone; "Ouvir de novo" reabre no toque', async () => {
    const ear = renderCalibration();
    await waitFor(() => expect(ear.started).toBe(1));
    act(() => ear.close('hidden'));
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir de novo' }));
    expect(ear.started).toBe(2);
  });
});
