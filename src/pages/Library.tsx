import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { OfflineBanner } from '../components/OfflineBanner/OfflineBanner';
import { clampLines, Kicker, Screen, ScreenTitle } from '../components/Screen/Screen';
import { matchesSearch, SearchField } from '../components/SearchField/SearchField';
import { SongCover } from '../components/SongCover/SongCover';
import { offlineTag, songMeta } from '../components/SongCover/songFacts';
import { savedCount, useShelf, type ShelfSong } from '../services/shelf';
import { modesUrl } from '../shell/choice';
import { ROUTES } from '../shell/routes';
import { LibraryEmpty } from './LibraryEmpty';

export const SORTS = {
  shelf: { label: 'Ordem da estante', compare: () => 0 },
  title: { label: 'Nome', compare: (a: ShelfSong, b: ShelfSong) => a.title.localeCompare(b.title, 'pt-BR') },
  tempo: { label: 'Andamento', compare: (a: ShelfSong, b: ShelfSong) => a.bpm - b.bpm },
  length: { label: 'Duração', compare: (a: ShelfSong, b: ShelfSong) => a.durationSeconds - b.durationSeconds },
} as const;
type SortKey = keyof typeof SORTS;

const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};
`;

const Intro = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};

  @media (max-height: 500px) {
    flex-direction: row-reverse;
    align-items: baseline;
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};

  > span {
    flex: 1;
  }
`;

const Tabs = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Tab = styled.button`
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
      width: 11.25rem;
    }
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
    height: 4.5rem;
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
      font-size: 0.875rem;
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

const SongCard: React.FC<{ song: ShelfSong; offline: boolean }> = ({ song, offline }) => {
  const tag = offlineTag(song, offline);
  return (
    <li>
      <Card to={modesUrl(undefined, song.id)}>
        <Cover id={song.id}>{tag && <Badge>{tag}</Badge>}</Cover>
        <CardBody>
          <b>{song.title}</b>
          <span>{songMeta(song)}</span>
          <Levels>{song.levels.map((l) => LEVEL_NAMES[l]).join(' · ')}</Levels>
        </CardBody>
      </Card>
    </li>
  );
};

/** 8 · Biblioteca: todas as músicas da estante em cartões; tocar abre a seleção de música com ela escolhida. */
export const Library: React.FC = () => {
  const shelf = useShelf();
  const [query, setQuery] = React.useState('');
  const [onlyApp, setOnlyApp] = React.useState(false);
  const [sort, setSort] = React.useState<SortKey>('shelf');

  const songs = shelf.status === 'ready' ? shelf.songs : [];
  const empty = shelf.status === 'ready' && !shelf.fallback && songs.length === 0;
  const visible = songs
    .filter((s) => (!onlyApp || s.embedded) && matchesSearch(query, s.title, s.composer))
    .sort(SORTS[sort].compare);
  const embedded = songs.filter((s) => s.embedded).length;
  const saved = savedCount(songs);
  const kicker = [`${songs.length} músicas`, `${embedded} no app`, saved ? `${saved} ${saved === 1 ? 'baixada' : 'baixadas'}` : ''].filter(Boolean).join(' · ');

  return (
    <Screen $gap="1.125rem">
      <Header>
        <Intro>
          <Kicker>{shelf.status === 'ready' ? kicker : 'Carregando…'}</Kicker>
          <ScreenTitle>Biblioteca</ScreenTitle>
        </Intro>
        <HeaderActions>
          <Button as={Link} to={ROUTES.editor} $variant="ghost">
            <span aria-hidden="true">✎</span>Escrever música
          </Button>
          <Button as={Link} to={ROUTES.home} $variant="ghost">
            <span aria-hidden="true">◂</span>Menu
          </Button>
        </HeaderActions>
      </Header>

      {shelf.status === 'ready' && shelf.fallback && <OfflineBanner reason={shelf.reason} count={songs.length} saved={saved > 0} />}

      {empty ? (
        <LibraryEmpty />
      ) : (
        <>
          <Toolbar>
            <Tabs role="group" aria-label="Filtro">
              <Tab type="button" aria-pressed={!onlyApp} onClick={() => setOnlyApp(false)}>
                Todas
              </Tab>
              <Tab type="button" aria-pressed={onlyApp} onClick={() => setOnlyApp(true)}>
                No app
              </Tab>
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
                <SongCard key={song.id} song={song} offline={shelf.fallback} />
              ))}
            </Grid>
          ) : (
            <Status role="status">{query.trim() ? `Nenhuma música com “${query.trim()}”.` : 'Nenhuma música neste filtro.'}</Status>
          )}
        </>
      )}
    </Screen>
  );
};
