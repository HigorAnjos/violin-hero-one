import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme, type Theme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { FakeAudioContext, FakeNode } from '../game/audio/testing/web-audio';
import { fakeSongImporter } from '../services/songImport';
import { createFakeEar, reading, type FakeEar } from '../shell/fakeEar';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { ScoreEditor } from './ScoreEditor';

const D_MAJOR = [62, 64, 66, 67, 69, 71, 73, 74];
/** Sem calibração: a latência padrão. */
const LATENCY = 0.1;

let compact = false;
beforeEach(() => {
  localStorage.clear();
  compact = false;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: query.includes('max-height') && compact, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

interface Setup {
  ear: FakeEar;
  context: FakeAudioContext;
  clicks: ReturnType<typeof vi.fn>;
}

function renderDictation({ theme, path = ROUTES.dictation }: { theme?: Theme; path?: string } = {}): Setup {
  const ear = createFakeEar();
  const context = new FakeAudioContext();
  context.currentTime = 5;
  ear.provideAudio({ context: context as unknown as AudioContext, source: new FakeNode() as unknown as AudioNode, stream: null });
  const clicks = vi.fn(() => () => undefined);
  const listen = vi.fn(async () => ({ done: new Promise<void>(() => undefined), stop: vi.fn() }));
  renderScreen(<ScoreEditor importer={fakeSongImporter()} listen={listen as never} dictation={{ clicks: clicks as never }} />, {
    path,
    route: `${ROUTES.editor}/*`,
    theme,
    ear,
  });
  return { ear, context, clicks };
}

const staffNotes = () => screen.queryAllByTestId('nota');
const location = () => screen.getByTestId('location').textContent;

/** Toca uma semínima de `midi` no tempo `beat` (a partir de 0) do ditado: leituras de 10 ms e o silêncio no fim. */
function play(ear: FakeEar, startAt: number, spb: number, beat: number, midi: number) {
  act(() => {
    for (let t = 0; t < spb - 0.1; t += 0.01) ear.pitch(reading(midi, startAt + LATENCY + beat * spb + t));
    ear.pitch(null);
  });
}

describe.each([
  ['Caderno', cadernoTheme],
  ['Palco', palcoTheme],
  ['8-Bits', pixelTheme],
] as [string, Theme][])('aba Ditar tocando no tema %s', (_name, theme) => {
  it('1280×720: abas, painel do ditado com a menor figura e o começar; microfone fechado até começar', () => {
    const { ear } = renderDictation({ theme });
    expect(screen.getByRole('tab', { name: /Ditar tocando/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /Na pauta/ })).toHaveAttribute('aria-selected', 'false');
    const panel = screen.getByRole('region', { name: 'Ditado pelo microfone' });
    expect(panel).toHaveTextContent('♩ = 72 · 4/4');
    expect(screen.getByRole('radio', { name: 'colcheia' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Começar ditado' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Prévia na pista' })).toBeInTheDocument();
    expect(ear.started).toBe(0);
  });

  it('844×390: o painel continua, sem a prévia na pista', async () => {
    compact = true;
    renderDictation({ theme });
    expect(screen.queryByRole('region', { name: 'Prévia na pista' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'semicolcheia' }));
    expect(screen.getByRole('radio', { name: 'semicolcheia' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Começar ditado' })).toBeInTheDocument();
  });
});

describe('ditar tocando', () => {
  it('a aba Na pauta não tem o painel; trocar de aba mantém o que foi escrito', async () => {
    renderDictation({ path: `${ROUTES.editor}?importacao=simulada` });
    expect(screen.queryByRole('region', { name: 'Ditado pelo microfone' })).not.toBeInTheDocument();
    await userEvent.keyboard('dfa');
    expect(staffNotes()).toHaveLength(3);
    await userEvent.click(screen.getByRole('tab', { name: /Ditar tocando/ }));
    expect(location()).toBe(`${ROUTES.dictation}?importacao=simulada`);
    expect(screen.getByRole('region', { name: 'Ditado pelo microfone' })).toBeInTheDocument();
    expect(staffNotes()).toHaveLength(3);
  });

  it('contagem de 1 compasso, as notas aparecem enquanto toca, Esc para e cai na pauta', async () => {
    const { ear, context, clicks } = renderDictation();
    await userEvent.click(screen.getByRole('button', { name: 'Começar ditado' }));
    expect(ear.started).toBe(1);
    expect(ear.a4).toBe(442);

    // 4/4 a ♩ = 72: quatro cliques, o último um tempo antes do primeiro tempo do ditado
    const spb = 60 / 72;
    const times = clicks.mock.calls[0][1] as number[];
    expect(times).toHaveLength(4);
    const startAt = times[3] + spb;
    expect(times[0]).toBeGreaterThan(5);
    await waitFor(() => expect(screen.getByTestId('contagem')).toHaveTextContent('4'));
    expect(screen.getByRole('combobox', { name: 'Andamento' })).toBeDisabled();

    context.currentTime = startAt;
    await waitFor(() => expect(screen.getByRole('region', { name: 'Ditado pelo microfone' })).toHaveTextContent('Ouvindo…'));

    D_MAJOR.slice(0, 7).forEach((midi, beat) => play(ear, startAt, spb, beat, midi));
    expect(staffNotes()).toHaveLength(7);
    // A oitava nota ainda soa quando a pessoa para: entra pelo finish
    act(() => {
      for (let t = 0; t < 0.5; t += 0.01) ear.pitch(reading(74, startAt + LATENCY + 7 * spb + t));
    });
    expect(screen.getByRole('region', { name: 'Ditado pelo microfone' })).toHaveTextContent('Ré5');
    context.currentTime = startAt + LATENCY + 7 * spb + 0.75;
    await userEvent.keyboard('{Escape}');

    expect(location()).toBe(ROUTES.editor);
    expect(staffNotes()).toHaveLength(8);
    expect(screen.getByRole('group', { name: /Pauta/ })).toHaveFocus();
    expect(screen.getByText('4 compassos · 8 notas')).toBeInTheDocument();
  });

  it('o botão Parar também termina; com o metrônomo desligado não há clique depois da contagem', async () => {
    const { ear, context, clicks } = renderDictation();
    await userEvent.click(screen.getByRole('button', { name: 'Começar ditado' }));
    const spb = 60 / 72;
    const startAt = (clicks.mock.calls[0][1] as number[])[3] + spb;
    context.currentTime = startAt;
    await waitFor(() => expect(screen.getByRole('region', { name: 'Ditado pelo microfone' })).toHaveTextContent('Ouvindo…'));
    play(ear, startAt, spb, 0, 69);
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    expect(location()).toBe(ROUTES.editor);
    expect(staffNotes()).toHaveLength(1);
    expect(clicks).toHaveBeenCalledTimes(1);
  });

  it('o ditado continua depois do que já estava escrito, no compasso seguinte', async () => {
    const { ear, clicks, context } = renderDictation({ path: ROUTES.editor });
    await userEvent.keyboard('d');
    await userEvent.click(screen.getByRole('tab', { name: /Ditar tocando/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Começar ditado' }));
    const spb = 60 / 72;
    const startAt = (clicks.mock.calls[0][1] as number[])[3] + spb;
    context.currentTime = startAt;
    play(ear, startAt, spb, 0, 69);
    await userEvent.keyboard('{Escape}');
    expect(staffNotes()).toHaveLength(2);
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('region', { name: 'Nota selecionada' })).toHaveTextContent('comp. 2 · tempo 1');
  });

  it('microfone bloqueado leva à tela de problema, que volta para o ditado', async () => {
    const { ear } = renderDictation();
    ear.failNextStart('NotAllowedError');
    await userEvent.click(screen.getByRole('button', { name: 'Começar ditado' }));
    await waitFor(() => expect(location()).toMatch(/^\/microfone\/problema\?motivo=sem-permissao&depois=%2Feditor%2Fditar&causa=denied$/));
  });

  it('o microfone fechado de fora (aba escondida) encerra o ditado com o que já entrou', async () => {
    const { ear, clicks, context } = renderDictation();
    await userEvent.click(screen.getByRole('button', { name: 'Começar ditado' }));
    const spb = 60 / 72;
    const startAt = (clicks.mock.calls[0][1] as number[])[3] + spb;
    context.currentTime = startAt;
    play(ear, startAt, spb, 0, 66);
    act(() => ear.close('hidden'));
    await waitFor(() => expect(location()).toBe(ROUTES.editor));
    expect(staffNotes()).toHaveLength(1);
  });
});
