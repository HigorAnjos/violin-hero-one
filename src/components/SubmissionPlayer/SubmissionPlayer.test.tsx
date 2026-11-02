import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { ClassroomError } from '../../services/classroom';
import { SubmissionPlayer } from './SubmissionPlayer';

const mount = (load: () => Promise<string>) =>
  render(
    <ThemeProvider theme={cadernoTheme}>
      <SubmissionPlayer label="gravação da Ana" durationMs={48_000} load={load} />
    </ThemeProvider>
  );

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
});
afterEach(() => vi.restoreAllMocks());

describe('SubmissionPlayer', () => {
  it('pede o endereço só no primeiro play e usa a duração gravada, não a do arquivo', async () => {
    const load = vi.fn().mockResolvedValue('https://x/assinada');
    mount(load);
    expect(screen.getByText('0:00 / 0:48')).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Tocar gravação da Ana' }));
    expect(await screen.findByRole('button', { name: 'Pausar gravação da Ana' })).toBeInTheDocument();
    const audio = screen.getByTestId('submission-audio') as HTMLAudioElement;
    expect(audio).toHaveAttribute('src', 'https://x/assinada');
    Object.defineProperty(audio, 'currentTime', { value: 29.4, configurable: true, writable: true });
    fireEvent.timeUpdate(audio);
    expect(screen.getByText('0:29 / 0:48')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pausar gravação da Ana' }));
    await userEvent.click(screen.getByRole('button', { name: 'Tocar gravação da Ana' }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('endereço que não vem: a mensagem do erro; arquivo que falha: o próximo play pede outro endereço', async () => {
    const load = vi.fn().mockRejectedValueOnce(new ClassroomError('not-found')).mockResolvedValue('https://x/a');
    mount(load);
    await userEvent.click(screen.getByRole('button', { name: 'Tocar gravação da Ana' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontramos isso');
    await userEvent.click(screen.getByRole('button', { name: 'Tocar gravação da Ana' }));
    await waitFor(() => expect(screen.getByTestId('submission-audio')).toBeInTheDocument());
    act(() => {
      fireEvent.error(screen.getByTestId('submission-audio'));
    });
    expect(screen.queryByTestId('submission-audio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tocar gravação da Ana' }));
    expect(load).toHaveBeenCalledTimes(3);
  });
});
