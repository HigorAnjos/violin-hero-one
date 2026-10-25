import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, it, expect } from 'vitest';
import { isOnboarded } from '../services/profile';
import { createFakeEar } from '../shell/fakeEar';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { OnboardMic } from './OnboardMic';

const renderMic = (ear = createFakeEar()) => {
  renderScreen(<OnboardMic />, { ear, path: ROUTES.mic, route: ROUTES.mic });
  return ear;
};

describe('OnboardMic', () => {
  afterEach(() => window.localStorage.clear());

  it('explica o porquê, mostra a etapa 1 e a privacidade', () => {
    renderMic();
    expect(screen.getByRole('heading', { level: 1, name: 'Precisamos ouvir seu violino' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Microfone');
    expect(screen.getByText('O som é analisado no seu navegador e não é gravado.')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Bloqueou sem querer?');
  });

  it('com permissão, liga o Ouvido e segue para as cordas soltas', async () => {
    const ear = renderMic();
    await userEvent.click(screen.getByRole('button', { name: /Permitir microfone/ }));
    expect(ear.started).toBe(1);
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.strings);
  });

  it('permissão negada leva à tela de microfone bloqueado, voltando depois para as cordas', async () => {
    const ear = createFakeEar();
    ear.failNextStart('NotAllowedError');
    renderMic(ear);
    await userEvent.click(screen.getByRole('button', { name: /Permitir microfone/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/microfone/problema?motivo=sem-permissao&depois=%2Fprimeira-vez%2Fcordas');
  });

  it('"Pular por agora" encerra a primeira vez e vai para o início', async () => {
    renderMic();
    await userEvent.click(screen.getByRole('link', { name: 'Pular por agora' }));
    expect(isOnboarded()).toBe(true);
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
