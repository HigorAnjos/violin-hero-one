import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BackLink, NavigationScreen as Screen } from '../components/BackLink/BackLink';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { portrait } from '../assets/styles/media';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countInTiming';
import { OfflineBanner } from '../components/OfflineBanner/OfflineBanner';
import { clampLines, Kicker, ScreenTitle } from '../components/Screen/Screen';
import { matchesSearch, SearchField } from '../components/SearchField/SearchField';
import { SongCover } from '../components/SongCover/SongCover';
import { offlineTag, songMeta } from '../components/SongCover/songFacts';
import { savedCount, useShelf, type ShelfSong } from '../services/shelf';
import { modesUrl } from '../shell/choice';
import { ROUTES } from '../shell/routes';
import { LibraryEmpty } from './LibraryEmpty';
import { categoryOfSheet, deleteOwnSong, songKeys, useOwnSongs, useSavedSongs } from '../services/songs';
import { songCache } from '../services/songCache';
import { DEV_TOOLS } from '../shell/devTools';
import { rgba } from '../assets/styles/themes/color';
import { progressKeys } from '../services/progress';

export const SORTS = {
  shelf: { label: 'Ordem da estante', compare: () => 0 },
  title: { label: 'Nome', compare: (a: ShelfSong, b: ShelfSong) => a.title.localeCompare(b.title, 'pt-BR') },
  tempo: { label: 'Andamento', compare: (a: ShelfSong, b: ShelfSong) => a.bpm - b.bpm },
  length: { label: 'Duração', compare: (a: ShelfSong, b: ShelfSong) => a.durationSeconds - b.durationSeconds },
} as const;
type SortKey = keyof typeof SORTS;

/** Os exercícios técnicos ficam num grupo próprio, separado das músicas; "Todas" mostra os dois. */
export const FILTERS = {
  all: { label: 'Todas', keep: () => true },
  musica: { label: 'Músicas', keep: (s: ShelfSong) => s.category === 'musica' },
  exercicio: { label: 'Exercícios técnicos', keep: (s: ShelfSong) => s.category === 'exercicio' },
  app: { label: 'No app', keep: (s: ShelfSong) => s.embedded },
} as const;
type FilterKey = keyof typeof FILTERS;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};

  @media (max-height: 500px) {
    align-items: center;
    gap: ${({ theme }) => theme.spacing.sm};
  }

  /* Em pé: os botões numa linha no alto e o título embaixo, com a largura toda */
  ${portrait} {
    flex-direction: column-reverse;
    align-items: stretch;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  @media (max-height: 500px) {
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: row-reverse;
    justify-content: flex-end;
    align-items: baseline;
    gap: ${({ theme }) => theme.spacing.sm};

    > ${Kicker} {
      ${clampLines(1)}
    }
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};

  @media (max-height: 500px) {
    flex: none;
    gap: ${({ theme }) => theme.spacing.xs};
  }

  ${portrait} {
    justify-content: flex-end;
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

/**
 * Só no desktop: no celular (deitado, MobileLibrary, ou em pé) o editor fica dentro do "Importar" ("Escrever ou
 * ditar").
 */
const WideOnly = styled(Button)`
  @media (max-height: 500px) {
    display: none;
  }

  ${portrait} {
    display: none;
  }
`;

const CompactOnly = styled(Button)`
  display: none;
  padding: 0 1rem;

  @media (max-height: 500px) {
    display: inline-flex;
  }

  ${portrait} {
    display: inline-flex;
  }
`;

/** Lupa do celular deitado: abre a busca e a ordem, que no desktop ficam sempre na barra. */
const SearchToggle = styled(Button)`
  display: none;
  padding: 0;

  &[aria-expanded='true'] {
    border-color: ${({ theme }) => theme.colors.info.main};
    color: ${({ theme }) => theme.colors.info.text};
  }

  @media (max-height: 500px) {
    display: inline-flex;
  }
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  > span {
    flex: 1;
  }

  @media (max-height: 500px) {
    &:not([data-open]) > :not([role='group']) {
      display: none;
    }
  }

  /* Em pé: os filtros quebram linha (nenhum cortado) e a busca e a ordem dividem a linha de baixo */
  ${portrait} {
    flex-wrap: wrap;

    > span {
      display: none;
    }

    > [role='group'] {
      flex: 1 1 100%;
      flex-wrap: wrap;
      overflow-x: visible;
    }

    > label:first-of-type {
      flex: 1 1 0;
      width: auto;
    }
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
  min-width: 0;
  /* no celular deitado os quatro filtros rolam de lado em vez de empurrar a busca */
  overflow-x: auto;
  padding: 4px;
  margin: -4px;
`;

const Tab = styled.button`
  flex: none;
  min-height: 2.75rem;
  padding: 0 1rem;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.textMuted};

  &[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.info.main};
    border-color: ${({ theme }) => theme.colors.info.main};
    color: ${({ theme }) => theme.colors.surface};
  }
`;

const Search = styled(SearchField)`
  width: 15rem;

  @media (max-height: 500px) {
    width: 11rem;
  }
`;

const Sort = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  select {
    min-height: 2.75rem;
    padding: 0 0.625rem;
    background-color: ${({ theme }) => theme.colors.surfaceHover};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: 3px;
    color: ${({ theme }) => theme.colors.text};
    font-size: 0.875rem;
  }

  @media (max-height: 500px) {
    span {
      display: none;
    }
  }

  ${portrait} {
    span {
      display: none;
    }
  }
`;

const Grid = styled.ul`
  flex: 1 1 0;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: min-content;
  gap: ${({ theme }) => theme.spacing.md};
  overflow-y: auto;
  padding: 4px;
  margin: -4px;

  @media (max-width: 900px) and (min-height: 501px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-height: 500px) {
    display: flex;
    gap: ${({ theme }) => theme.spacing.sm};
    overflow-x: auto;
    overflow-y: hidden;
    align-items: flex-start;

    > li {
      flex: none;
      width: 11.5rem;
    }
  }

  /* Em pé: duas colunas e a página rola, em vez de rolar por dentro */
  ${portrait} {
    flex: none;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: ${({ theme }) => theme.spacing.sm};
    overflow: visible;
  }
`;

const Card = styled(Link)`
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 3px;

  @media (hover: hover) {
    &:hover {
      border-color: ${({ theme }) => theme.colors.primary.main};
      box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary.border};
    }
  }
`;

const Cover = styled(SongCover)`
  height: 6.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-height: 500px) {
    height: 5.25rem;
  }
`;

const Badge = styled.span`
  position: absolute;
  top: 0.5rem;
  left: 0.5rem;
  padding: 0.3125rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.info.main};
  color: ${({ theme }) => theme.colors.surface};
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 1;
  letter-spacing: 0.14em;
  text-transform: uppercase;
`;

const CardBody = styled.span`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 0.75rem 0.875rem;

  b {
    ${clampLines(2)}
    font-weight: 600;
    font-size: 1rem;
    line-height: 1.25rem;
  }

  span {
    ${clampLines(1)}
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => theme.spacing.xs};

    b {
      ${clampLines(1)}
      font-size: 0.9375rem;
    }
  }
`;

const Levels = styled.span`
  &&& {
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    color: ${({ theme }) => theme.colors.info.text};
  }
`;

const Status = styled.p`
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const SongCard: React.FC<{ song: ShelfSong & { origin?: string }; offline: boolean; onDelete?: () => void }> = ({ song, offline, onDelete }) => {
  const tag = offlineTag(song, offline);
  return (
    <li>
      <Card to={modesUrl(undefined, song.id)}>
        <Cover id={song.id}>{tag && <Badge>{tag}</Badge>}</Cover>
        <CardBody>
          <b>{song.title}</b>
          {song.origin && song.origin !== 'catalog' && <span>{song.origin === 'imported' ? 'Importada' : 'Escrita'} · Só você</span>}
          <span>{songMeta(song)}</span>
          <Levels>{song.levels.map((l) => LEVEL_NAMES[l]).join(' · ')}</Levels>
        </CardBody>
      </Card>
      {onDelete && (
        <Button $variant="ghost" onClick={onDelete} aria-label={`Apagar ${song.title}`}>
          Apagar
        </Button>
      )}
    </li>
  );
};

/** 8 · Biblioteca: todas as músicas da estante em cartões; tocar abre a seleção de música com ela escolhida. */
export const Library: React.FC = () => {
  const shelf = useShelf();
  const own = useOwnSongs();
  const kept = useSavedSongs();
  const queries = useQueryClient();
  const [deleting, setDeleting] = React.useState<ShelfSong | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const dialog = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    if (deleting) dialog.current?.showModal();
  }, [deleting]);
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    try {
      const simulated = DEV_TOOLS && new URLSearchParams(window.location.search).get('importacao') === 'simulada';
      if (!simulated) await deleteOwnSong(deleting.id);
      await songCache?.forget(deleting.id);
      queries.removeQueries({ queryKey: ['songs', 'song', deleting.id] });
      await Promise.all([songKeys.mine, songKeys.saved, progressKeys.all].map((queryKey) => queries.invalidateQueries({ queryKey })));
      setDeleting(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível apagar agora.');
    } finally {
      setBusy(false);
    }
  };
  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<FilterKey>('all');
  const [sort, setSort] = React.useState<SortKey>('shelf');
  // Celular deitado: busca e ordem fechadas atrás da lupa; com texto na busca ficam abertas
  const [searching, setSearching] = React.useState(false);
  const searchOpen = searching || query !== '';
  const toolbar = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (searching) toolbar.current?.querySelector('input')?.focus();
  }, [searching]);

  const mine = own.data ?? (kept.data ?? []).filter((s) => s.sheet.origin !== 'catalog').map((s) => ({ ...s.sheet, levels: s.levels }));
  const byId = new Map<string, ShelfSong & { origin?: string }>((shelf.status === 'ready' ? shelf.songs : []).map((s) => [s.id, s]));
  for (const song of mine) {
    byId.set(song.id, { ...song, category: categoryOfSheet(song), embedded: false, saved: !!kept.data?.some((s) => s.sheet.id === song.id) });
  }
  const songs = [...byId.values()];
  const empty = shelf.status === 'ready' && !shelf.fallback && songs.length === 0;
  const visible = songs.filter((s) => FILTERS[filter].keep(s) && matchesSearch(query, s.title, s.composer)).sort(SORTS[sort].compare);
  const exercises = songs.filter((s) => s.category === 'exercicio').length;
  const embedded = songs.filter((s) => s.embedded).length;
  const saved = savedCount(songs);
  const kicker = [
    `${songs.length - exercises} músicas`,
    exercises ? `${exercises} ${exercises === 1 ? 'exercício' : 'exercícios'}` : '',
    `${embedded} no app`,
    saved ? `${saved} ${saved === 1 ? 'baixada' : 'baixadas'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen $gap="1.125rem">
      <Header>
        <Intro>
          <Kicker>{shelf.status === 'ready' ? kicker : 'Carregando…'}</Kicker>
          <ScreenTitle>Biblioteca</ScreenTitle>
        </Intro>
        <HeaderActions>
          {!empty && (
            <SearchToggle
              type="button"
              $variant="ghost"
              aria-label="Buscar"
              aria-expanded={searchOpen}
              aria-controls="biblioteca-busca"
              onClick={() => {
                setSearching(!searchOpen);
                setQuery('');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M11 11l4 4" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </SearchToggle>
          )}
          <WideOnly as={Link} to={ROUTES.import} $variant="ghost">
            Importar música
          </WideOnly>
          <CompactOnly as={Link} to={ROUTES.import}>
            <span aria-hidden="true">＋</span>Importar
          </CompactOnly>
          <WideOnly as={Link} to={ROUTES.editor} $variant="ghost">
            <span aria-hidden="true">✎</span>Escrever música
          </WideOnly>
          {/* O retorno fica por último, na ponta direita do cabeçalho, como nas outras telas */}
          <BackLink />
        </HeaderActions>
      </Header>

      {shelf.status === 'ready' && shelf.fallback && <OfflineBanner reason={shelf.reason} count={songs.length} saved={saved > 0} />}

      {empty ? (
        <LibraryEmpty />
      ) : (
        <>
          <Toolbar ref={toolbar} id="biblioteca-busca" data-open={searchOpen || undefined}>
            <Tabs role="group" aria-label="Filtro">
              {(Object.keys(FILTERS) as FilterKey[]).map((key) => (
                <Tab key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
                  {FILTERS[key].label}
                </Tab>
              ))}
            </Tabs>
            <span />
            <Search label="Buscar na biblioteca" value={query} onChange={setQuery} />
            <Sort>
              <span>Ordenar</span>
              <select aria-label="Ordenar" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                {(Object.keys(SORTS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORTS[key].label}
                  </option>
                ))}
              </select>
            </Sort>
          </Toolbar>
          {shelf.status === 'loading' ? (
            <Status role="status">Carregando músicas…</Status>
          ) : visible.length ? (
            <Grid aria-label="Músicas">
              {visible.map((song) => (
                <SongCard
                  key={song.id}
                  song={song}
                  offline={shelf.fallback}
                  onDelete={
                    song.origin && song.origin !== 'catalog'
                      ? () => {
                          setError('');
                          setDeleting(song);
                        }
                      : undefined
                  }
                />
              ))}
            </Grid>
          ) : (
            <Status role="status">{query.trim() ? `Nenhuma música com “${query.trim()}”.` : 'Nenhuma música neste filtro.'}</Status>
          )}
        </>
      )}
      {deleting && (
        <DeleteDialog
          ref={dialog}
          aria-labelledby="apagar-titulo"
          onCancel={(e) => {
            if (busy) e.preventDefault();
            else setDeleting(null);
          }}
        >
          <h2 id="apagar-titulo">Apagar música?</h2>
          <p>
            Apagar “{deleting.title}” da sua Biblioteca e deste aparelho? As partidas e o recorde desta música também serão apagados. Seus selos e sua sequência ficam. Esta ação
            não pode ser desfeita.
          </p>
          {error && <p role="alert">{error}</p>}
          <Button autoFocus $variant="ghost" disabled={busy} onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={() => void remove()}>
            {busy ? 'Apagando…' : 'Apagar música'}
          </Button>
        </DeleteDialog>
      )}
    </Screen>
  );
};

const DeleteDialog = styled.dialog`
  margin: auto;
  max-width: min(32rem, calc(100vw - 2rem));
  padding: 1.5rem;
  color: ${({ theme }) => theme.colors.text};
  background: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  p {
    margin: 1rem 0;
  }
  button {
    margin-right: 0.5rem;
  }
  &::backdrop {
    background: ${({ theme }) => rgba(theme.colors.background, 0.6)};
  }
`;
