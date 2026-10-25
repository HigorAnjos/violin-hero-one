import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { createFakeEar, reading, type FakeEar } from '../shell/fakeEar';
import { micTroubleUrl, ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { MicTrouble } from './MicTrouble';

const renderTrouble = (url: string, ear: FakeEar = createFakeEar(), theme = undefined as typeof palcoTheme | undefined) => {
  renderScreen(<MicTrouble />, { ear, path: url, route: ROUTES.micTrouble, theme });
  return ear;
};

describe('MicTrouble', () => {
  it('sem som: diz que pausou, dá dicas e foca o "Continuar"', async () => {
    renderTrouble(micTroubleUrl('no-sound', ROUTES.strings));
    const dialog = screen.getByRole('alertdialog', { name: 'Não estou te ouvindo' });
    expect(dialog).toHaveAccessibleDescription('Toque a corda Lá solta e eu continuo sozinho.');
    expect(screen.getByText('Música pausada')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Nível do microfone: quase nada' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continuar' })).toHaveFocus();
  });

  it('sem som: tocar a corda Lá solta continua sozinho', async () => {
    const ear = renderTrouble(micTroubleUrl('no-sound', ROUTES.strings));
    await waitFor(() => expect(ear.started).toBe(1));
    act(() => ear.pitch(reading(62, 1)));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.micTrouble);
    act(() => ear.pitch(reading(69, 2)));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.strings);
  });

  it('barulho: medidor ao vivo e "Continuar mesmo assim"', async () => {
    const ear = renderTrouble(micTroubleUrl('noisy', ROUTES.countdown), createFakeEar(), palcoTheme);
    expect(screen.getByRole('alertdialog', { name: 'Tem muito barulho por aí' })).toBeInTheDocument();
    act(() => {
      for (let i = 0; i < 40; i++) ear.level(-6);
    });
    expect(screen.getByRole('img', { name: 'Nível do microfone: alto' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continuar mesmo assim' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.countdown);
  });

  it('bloqueado: "Tentar de novo" pede o microfone e volta quando libera', async () => {
    const ear = createFakeEar();
    renderTrouble(micTroubleUrl('blocked', ROUTES.strings), ear);
    expect(screen.getByRole('alertdialog', { name: 'O microfone foi bloqueado' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nível do microfone: sem sinal' })).toBeInTheDocument();
    expect(ear.started).toBe(0);

    ear.failNextStart('NotAllowedError');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByRole('status')).toHaveTextContent('Ainda bloqueado.');
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.micTrouble);

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.strings);
  });

  it('se o navegador recusa ao ouvir, troca para o estado de bloqueado', async () => {
    const ear = createFakeEar();
    ear.failNextStart('NotAllowedError');
    renderTrouble(micTroubleUrl('no-sound', ROUTES.strings), ear);
    expect(await screen.findByRole('alertdialog', { name: 'O microfone foi bloqueado' })).toBeInTheDocument();
  });

  it('"Ajustar microfone" volta para as instruções do microfone', async () => {
    renderTrouble(micTroubleUrl('no-sound', ROUTES.strings));
    await userEvent.click(screen.getByRole('link', { name: 'Ajustar microfone' }));
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.mic);
  });
});
