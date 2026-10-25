import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { OPEN_STRING_MIDI } from '../game/notation/violin';
import { isOnboarded } from '../services/profile';
import { createFakeEar, reading, type FakeEar } from '../shell/fakeEar';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { OnboardTest, progressText } from './OnboardTest';

const renderTest = (ear: FakeEar = createFakeEar()) => {
  renderScreen(<OnboardTest />, { ear, path: ROUTES.strings, route: ROUTES.strings });
  return ear;
};

function bow(ear: FakeEar, midi: number, from: number, seconds = 2.1, cents = 0) {
  act(() => {
    for (let t = 0; t <= seconds; t += 0.01) ear.pitch(reading(midi, from + t, cents));
    ear.pitch(null);
  });
}

describe('progressText', () => {
  it('diz quantas faltam, em português', () => {
    expect(progressText(0)).toBe('0 de 4 cordas · falta Sol, Ré, Lá e Mi');
    expect(progressText(2)).toBe('2 de 4 cordas · falta Lá e Mi');
    expect(progressText(3)).toBe('3 de 4 cordas · falta Mi');
    expect(progressText(4)).toBe('4 de 4 cordas · tudo certo!');
  });
});

describe('OnboardTest', () => {
  afterEach(() => window.localStorage.clear());

  it('liga o Ouvido e começa pedindo a corda Sol', async () => {
    const ear = renderTest();
    await waitFor(() => expect(ear.started).toBe(1));
    expect(screen.getByRole('heading', { level: 1, name: 'Toque cada corda solta com o arco' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Sol (G): Toque agora' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeDisabled();
  });

  it('ouve as quatro cordas em ordem e libera a primeira música', async () => {
    const ear = renderTest();
    bow(ear, OPEN_STRING_MIDI[0], 0, 2.1, -2);
    bow(ear, OPEN_STRING_MIDI[1], 3, 2.1, 1);
    expect(screen.getByRole('listitem', { name: 'Sol (G): Ouvida · −2 ¢' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Ré (D): Ouvida · +1 ¢' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 de 4 cordas · falta Lá e Mi');
    bow(ear, OPEN_STRING_MIDI[2], 6);
    bow(ear, OPEN_STRING_MIDI[3], 9);
    const next = screen.getByRole('button', { name: /Continuar/ });
    expect(next).toBeEnabled();
    await userEvent.click(next);
    expect(isOnboarded()).toBe(true);
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.countdown);
  });

  it('mostra o "segurando" da corda da vez', () => {
    const ear = renderTest();
    act(() => {
      for (let t = 0; t <= 1.2; t += 0.01) ear.pitch(reading(OPEN_STRING_MIDI[0], t, 4));
    });
    expect(Number(screen.getByRole('progressbar', { name: 'Segurando' }).getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(59);
    expect(screen.getByText('● Ouvindo · +4 ¢')).toBeInTheDocument();
  });

  it('sem microfone, vai para a tela de problema e volta para cá depois', async () => {
    const ear = createFakeEar();
    ear.failNextStart('NotFoundError');
    renderTest(ear);
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/microfone/problema?motivo=sem-som&depois=%2Fprimeira-vez%2Fcordas')
    );
  });
});
