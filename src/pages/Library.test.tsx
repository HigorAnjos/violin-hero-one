import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { palcoTheme } from '../assets/styles/themes/palco';
import { CATALOG_ORDER } from '../game/notation/catalog';
import { FIXED_SONGS } from '../game/notation/songs';
import { fakeCatalogClient } from '../services/testing';
import { ROUTES } from '../shell/routes';
import { renderScreen } from '../shell/testing';
import { Library } from './Library';

const db = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('../services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));

const renderLibrary = (theme?: typeof palcoTheme) => renderScreen(<Library />, { path: ROUTES.library, route: ROUTES.library, theme });
const cards = () => within(screen.getByRole('list', { name: 'Músicas' })).getAllByRole('link');

describe('Library', () => {
  afterEach(() => {
    db.client = null;
  });

  it('com o catálogo: as 10 na ordem da estante, com níveis e as do app marcadas', async () => {
    db.client = fakeCatalogClient().client;
    renderLibrary(palcoTheme);
    await waitFor(() => expect(cards()).toHaveLength(CATALOG_ORDER.length));
    expect(screen.getByText(`${CATALOG_ORDER.length} músicas · ${FIXED_SONGS.length} no app`)).toBeInTheDocument();
    const first = cards()[0];
    expect(first).toHaveAttribute('href', `/tocar/musica?modo=arcade&musica=${CATALOG_ORDER[0]}`);
    expect(first).toHaveTextContent('Fácil · Médio · Difícil');
    expect(first).toHaveTextContent('No app');
  });

  it('filtro "No app", busca e ordem por nome', async () => {
    db.client = fakeCatalogClient().client;
    renderLibrary();
    await waitFor(() => expect(cards()).toHaveLength(CATALOG_ORDER.length));
    await userEvent.click(screen.getByRole('button', { name: 'No app' }));
    expect(cards()).toHaveLength(FIXED_SONGS.length);
    await userEvent.click(screen.getByRole('button', { name: 'Todas' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar' }), 'Nome');
    const titles = cards().map((c) => c.querySelector('b')!.textContent!);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar na biblioteca' }), 'jingle');
    expect(cards()).toHaveLength(1);
  });

  it('sem internet: as embutidas e o aviso', async () => {
    renderLibrary();
    expect(await screen.findByText('Sem internet', undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(cards()).toHaveLength(FIXED_SONGS.length);
  });

  it('catálogo vazio: biblioteca vazia com as grátis para começar', async () => {
    db.client = fakeCatalogClient({ ids: [] }).client;
    renderLibrary();
    expect(await screen.findByRole('heading', { name: 'Sua biblioteca ainda está vazia' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tocar a primeira grátis/ })).toHaveAttribute(
      'href',
      `/tocar/carregando?modo=arcade&musica=${FIXED_SONGS[0].id}&nivel=facil`
    );
    expect(within(screen.getByRole('list', { name: 'Grátis para começar' })).getAllByRole('link')).toHaveLength(FIXED_SONGS.length);
  });

  it('Menu volta para a tela inicial', async () => {
    renderLibrary();
    await userEvent.click(screen.getByRole('link', { name: /Menu/ }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });
});
