import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cadernoTheme, type Theme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { createEditor, insertNote } from '../game/notation/editor';
import { loadDraft, saveDraft } from '../services/editorDraft';
import { fakeSongImporter } from '../services/songImport';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { figureLabel, ScoreEditor } from './ScoreEditor';

let compact = false;
beforeEach(() => {
  // A tela grava o rascunho ao desmontar: o da tela anterior não pode vazar para a próxima
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

function renderEditor(options: { theme?: Theme; importer?: ReturnType<typeof fakeSongImporter>; listen?: never } = {}) {
  const importer = options.importer ?? fakeSongImporter();
  const listen = options.listen ?? vi.fn(async () => ({ done: new Promise<void>(() => undefined), stop: vi.fn() }));
  renderScreen(<ScoreEditor importer={importer} listen={listen as never} />, { path: ROUTES.editor, route: ROUTES.editor, theme: options.theme });
  return { importer, listen };
}

const staffNotes = () => screen.queryAllByTestId('nota');
const location = () => screen.getByTestId('location').textContent;

describe.each([
  ['Caderno', cadernoTheme],
  ['Palco', palcoTheme],
  ['8-Bits', pixelTheme],
] as [string, Theme][])('ScoreEditor no tema %s', (_name, theme) => {
  it('1280×720: título, compasso, tom e andamento, paleta, pauta, nota selecionada, prévia na pista e atalhos', () => {
    renderEditor({ theme });
    expect(screen.getByRole('textbox', { name: 'Título da música' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Compasso' })).toHaveValue('4/4');
    expect(screen.getByRole('combobox', { name: 'Tonalidade' })).toHaveValue('D major');
    expect(screen.getByRole('combobox', { name: 'Andamento' })).toHaveValue('72');
    expect(screen.getByRole('toolbar', { name: 'Ferramentas de nota' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Partitura em edição' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Nota selecionada' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Prévia na pista' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar na biblioteca' })).toBeInTheDocument();
    expect(screen.getByText('4 compassos · 0 notas')).toBeInTheDocument();
  });

  it('844×390: sem a prévia na pista; escrever e salvar continuam', async () => {
    compact = true;
    renderEditor({ theme });
    expect(screen.queryByRole('region', { name: 'Prévia na pista' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mínima' }));
    await userEvent.keyboard('d');
    expect(staffNotes()).toHaveLength(1);
  });
});

describe('ScoreEditor', () => {
  it('a pauta recebe o foco e as letras escrevem a escala de Ré maior, com o dedilhado sugerido', async () => {
    renderEditor();
    expect(screen.getByRole('group', { name: /Pauta/ })).toHaveFocus();
    await userEvent.keyboard('defgabcd');
    expect(staffNotes()).toHaveLength(8);
    expect(screen.getByText('4 compassos · 8 notas')).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'Nota selecionada' });
    expect(panel).toHaveTextContent('Ré5');
    expect(panel).toHaveTextContent('comp. 2 · tempo 4');
    expect(within(panel).getByRole('button', { name: 'Lá' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(panel).getByRole('button', { name: 'Dedo 3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Tudo cabe no violino \(Ré4 – Ré5\), só 1ª posição/)).toBeInTheDocument();
  });

  it('setas, figura, apagar, desfazer e refazer pelo teclado', async () => {
    renderEditor();
    await userEvent.keyboard('dfa');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}2');
    expect(screen.getByRole('region', { name: 'Nota selecionada' })).toHaveTextContent('mínima · 2 tempos');
    await userEvent.keyboard('{Delete}');
    expect(staffNotes()).toHaveLength(1);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(staffNotes()).toHaveLength(2);
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(staffNotes()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Refazer' })).toBeDisabled();
  });

  it('nota fora do violino aparece como aviso, sem mudar a pauta', async () => {
    renderEditor();
    await userEvent.keyboard('g{Shift>}{ArrowDown}{/Shift}');
    expect(screen.getByRole('complementary', { name: 'Detalhes da partitura' })).toHaveTextContent('Sol3');
    await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(within(screen.getByRole('complementary')).getByText('Sol2 não cabe no violino (Sol3 a Mi6).')).toBeInTheDocument();
    expect(staffNotes()).toHaveLength(1);
  });

  it('digitar no título não escreve nota', async () => {
    renderEditor();
    await userEvent.type(screen.getByRole('textbox', { name: 'Título da música' }), 'Escala de Ré');
    expect(staffNotes()).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Título da música' })).toHaveValue('Escala de Ré');
  });

  it('abre o rascunho do aparelho e grava o que muda', async () => {
    saveDraft(insertNote(createEditor({ title: 'Guardada' }), 69).doc);
    renderEditor();
    expect(screen.getByRole('textbox', { name: 'Título da música' })).toHaveValue('Guardada');
    expect(staffNotes()).toHaveLength(1);
    expect(screen.getByText('rascunho salvo no aparelho')).toBeInTheDocument();
    await userEvent.keyboard('b');
    await waitFor(() => expect(loadDraft()?.doc.notes).toHaveLength(2));
  });

  it('Ouvir toca a partitura; Espaço toca a partir do compasso do cursor', async () => {
    const { listen } = renderEditor();
    expect(screen.getByRole('button', { name: 'Ouvir' })).toBeDisabled();
    await userEvent.keyboard('defgab');
    await userEvent.click(screen.getByRole('button', { name: 'Ouvir' }));
    expect(listen).toHaveBeenCalledWith(expect.objectContaining({ measures: expect.any(Array) }), { fromMeasure: 0 });
    expect(screen.getByRole('button', { name: 'Parar' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Parar' }));
    screen.getByRole('group', { name: /Pauta/ }).focus();
    await userEvent.keyboard(' ');
    expect(listen).toHaveBeenLastCalledWith(expect.anything(), { fromMeasure: 1 });
  });

  it('salvar manda a Song (sem os compassos vazios) ao serviço e "Jogar agora" abre a escolha de modo com ela', async () => {
    const { importer } = renderEditor();
    await userEvent.type(screen.getByRole('textbox', { name: 'Título da música' }), 'Escala');
    screen.getByRole('group', { name: /Pauta/ }).focus();
    await userEvent.keyboard('defgabcd');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    const play = await screen.findByRole('link', { name: /Jogar agora/ });
    expect(importer.saved).toHaveLength(1);
    expect(importer.saved[0]).toMatchObject({ title: 'Escala', key: 'D major' });
    expect(importer.saved[0].measures).toHaveLength(2);
    expect(screen.getByText(/Só você vê esta música/)).toBeInTheDocument();
    expect(loadDraft()).toBeNull();
    await userEvent.click(play);
    expect(location()).toBe('/tocar?musica=escrita-1');
  });

  it('mudar depois de salvar volta o botão Salvar', async () => {
    renderEditor();
    await userEvent.keyboard('d');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    await screen.findByRole('link', { name: /Jogar agora/ });
    screen.getByRole('group', { name: /Pauta/ }).focus();
    await userEvent.keyboard('e');
    expect(screen.getByRole('button', { name: 'Salvar na biblioteca' })).toBeInTheDocument();
  });

  it('sem nota ou sem rede, o motivo aparece e o rascunho fica', async () => {
    renderEditor({ importer: fakeSongImporter({ fail: 'offline' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    expect(screen.getByText('Escreva pelo menos uma nota antes de salvar.')).toBeInTheDocument();
    screen.getByRole('group', { name: /Pauta/ }).focus();
    await userEvent.keyboard('d');
    await act(async () => void (await new Promise((r) => setTimeout(r, 450))));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar na biblioteca' }));
    expect(await screen.findByText(/Sem conexão para salvar/)).toBeInTheDocument();
    expect(loadDraft()?.doc.notes).toHaveLength(1);
  });

  it('o nome da figura na língua do músico', () => {
    const song = { timeSignature: { beats: 4, unit: 4 } } as never;
    expect(figureLabel(1, song)).toBe('semínima · 1 tempo');
    expect(figureLabel(3, song)).toBe('mínima pontuada · 3 tempos');
    expect(figureLabel(0.5, { timeSignature: { beats: 6, unit: 8 } } as never)).toBe('colcheia · 1 tempo');
    expect(figureLabel(1.25, song)).toBe('1,25 tempos');
  });
});
