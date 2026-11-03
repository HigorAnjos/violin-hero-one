import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppVersion, UNLOCK_TAPS, UNLOCK_WINDOW_MS } from '../components/AppVersion/AppVersion';
import { saveLatency } from '../game/audio';
import { createFakeEar, reading } from '../shell/fakeEar';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Diagnostics } from './Diagnostics';

function micAudio(settings: Record<string, unknown>) {
  const context = { sampleRate: 48000, state: 'running', baseLatency: 0.005, outputLatency: 0.02, currentTime: 10.012 };
  const stream = { getAudioTracks: () => [{ label: 'Fone Bluetooth da Joana', getSettings: () => settings }] } as unknown as MediaStream;
  return { context: context as unknown as AudioContext, source: {} as AudioNode, stream };
}

function setup(settings: Record<string, unknown> = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 48000 }) {
  const ear = createFakeEar();
  const audio = micAudio(settings);
  ear.provideAudio(audio);
  renderScreen(<Diagnostics />, { ear, path: ROUTES.diagnostics });
  const report = () => (screen.getByRole('textbox', { name: 'Diagnóstico em texto' }) as HTMLTextAreaElement).value;
  return { ear, audio, report };
}

/** O jsdom não tem área de transferência: entra só neste teste. */
function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, 'clipboard');
  localStorage.clear();
});

describe('Diagnostics', () => {
  it('antes de ligar: microfone fechado e nada pedido', () => {
    const { ear, report } = setup();
    expect(screen.getByRole('heading', { name: 'Diagnóstico de áudio' })).toBeInTheDocument();
    expect(ear.started).toBe(0);
    expect(report()).toContain('microfone: fechado');
  });

  it('ligar mostra o que o WebView aplicou, a taxa e as latências', async () => {
    const { ear, report } = setup({ echoCancellation: false, noiseSuppression: true, sampleRate: 44100 });
    await userEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }));
    expect(ear.started).toBe(1);
    expect(ear.a4).toBe(442);
    const text = report();
    // Só o tipo: o nome da pessoa no rótulo do fone não aparece na tela nem no texto copiado
    expect(text).toContain('microfone: bluetooth');
    expect(text).not.toContain('Joana');
    expect(document.body).not.toHaveTextContent('Joana');
    expect(text).toContain('aplicado: echoCancellation=desligado noiseSuppression=LIGADO autoGainControl=não informado');
    expect(text).toContain('ignorado pelo WebView: noiseSuppression');
    expect(text).toContain('taxa: contexto 48000 Hz · microfone 44100 Hz');
    expect(text).toContain('latência: base 5.0 ms · saída 20.0 ms');
    expect(text).toMatch(/sinais de Oboe: \n- o WebView não desliga noiseSuppression/);
    expect(screen.getByRole('button', { name: 'Desligar o microfone' })).toBeInTheDocument();
  });

  it('nível e nota ao vivo, com o atraso medido pelo relógio do contexto', async () => {
    const { ear, report } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }));
    act(() => {
      ear.level(-24);
      ear.pitch(reading(69, 10, 3));
    });
    const live = screen.getByLabelText('Ao vivo');
    await waitFor(() => expect(live).toHaveTextContent('A4 +3.0¢'), { timeout: 1000 });
    expect(live).toHaveTextContent('-24 dBFS');
    expect(live).toHaveTextContent('12.0 ms');
    expect(report()).toContain('atraso da detecção: média 12.0 ms · p95 12.0 ms (n=1)');
  });

  it('com calibração guardada e uma nota, estima som→julgamento', async () => {
    saveLatency({ latencySeconds: 0.06, confidence: 0.9, measuredAt: '2026-11-03T10:00:00.000Z' });
    const { ear, report } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }));
    expect(report()).toMatch(/calibração guardada: 60 ms \(confiança 0\.90/);
    expect(report()).toContain('som→julgamento estimado: precisa de calibração, de uma nota tocada');
    act(() => ear.pitch(reading(69, 10)));
    // 60 de ida e volta − 20 de saída + 12 da detecção
    await waitFor(() => expect(report()).toContain('som→julgamento estimado: 52 ms'), { timeout: 1000 });
    expect(report()).toContain('- som→julgamento estimado em 52 ms (meta 50 ms)');
  });

  it('microfone negado: diz o motivo no texto', async () => {
    const { ear, report } = setup();
    ear.failNextStart('NotAllowedError');
    await userEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }));
    expect(screen.getByRole('alert')).toHaveTextContent('denied');
    expect(report()).toContain('problema: O microfone não abriu: denied.');
  });

  it('fechar por fora (app no fundo) volta para "fechado"', async () => {
    const { ear, report } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Ligar o microfone' }));
    act(() => ear.close('hidden'));
    expect(report()).toContain('microfone: fechado');
    expect(screen.getByRole('button', { name: 'Ligar o microfone' })).toBeInTheDocument();
  });

  it('copiar põe o texto inteiro na área de transferência', async () => {
    const writeText = vi.fn(async () => undefined);
    stubClipboard(writeText);
    setup();
    // fireEvent: o userEvent troca a área de transferência pela dele
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar tudo' })));
    expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^Violin Hero · diagnóstico de áudio\n[\s\S]*microfone: fechado[\s\S]*estabilidade: /));
    expect(screen.getByRole('status')).toHaveTextContent('Copiado');
  });

  it('sem área de transferência (WebView): seleciona o texto para copiar à mão', async () => {
    stubClipboard(() => Promise.reject(new Error('negado')));
    setup();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar tudo' })));
    expect(screen.getByRole('status')).toHaveTextContent('Texto selecionado');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Diagnóstico em texto' }));
  });
});

describe('AppVersion', () => {
  it(`${UNLOCK_TAPS} toques seguidos na versão abrem o diagnóstico; devagar, não`, async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    renderScreen(<AppVersion />, { path: ROUTES.settings });
    const version = screen.getByRole('button', { name: /^Versão \d+\.\d+\.\d+$/ });
    for (let i = 0; i < UNLOCK_TAPS - 1; i++) act(() => version.click());
    vi.setSystemTime(Date.now() + UNLOCK_WINDOW_MS);
    act(() => version.click());
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.settings);
    for (let i = 0; i < UNLOCK_TAPS - 1; i++) act(() => version.click());
    expect(screen.getByTestId('location')).toHaveTextContent(ROUTES.diagnostics);
  });
});
