import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { OfflineBanner } from '../components/OfflineBanner/OfflineBanner';
import { useRadioGroup } from '../components/RadioGroup/useRadioGroup';
import { clampLines, Kicker, Screen, ScreenTitle } from '../components/Screen/Screen';
import { matchesSearch, SearchField } from '../components/SearchField/SearchField';
import { SongCover } from '../components/SongCover/SongCover';
import { songMeta } from '../components/SongCover/songFacts';
import { SongDetails } from '../components/SongDetails/SongDetails';
import { levelSettings, type PlayerLevel } from '../game/engine/levels';
import type { Level } from '../game/notation/song';
import { loadLocalProfile } from '../services/profile';
import { EMBEDDED_SHELF, usePlayableSong, useShelf, type ShelfSong } from '../services/shelf';
import { loadingUrl, modeFromSlug, modesUrl } from '../shell/choice';
import type { GameMode } from '../shell/play';

const DEFAULT_LEVEL: PlayerLevel = 'beginner';

/** O nível de chart do jogador, se a música tiver; senão o mais perto dele que ela tem. */
export function startingLevel(levels: readonly Level[], preferred: Level): Level {
  if (levels.includes(preferred)) return preferred;
  const order: Level[] = ['easy', 'medium', 'hard'];
  const at = order.indexOf(preferred);
  return [...levels].sort((a, b) => Math.abs(order.indexOf(a) - at) - Math.abs(order.indexOf(b) - at))[0] ?? 'easy';
}

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
  min-width: 0;

  @media (max-height: 500px) {
    gap: 0;
  }
`;

const Tools = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  min-width: 0;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Search = styled(SearchField)`
  width: 16.25rem;

  @media (max-height: 500px) {
    width: 12.5rem;
  }
`;

const Body = styled.div`
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  gap: ${({ theme }) => theme.spacing.xl};

  > aside {
    width: 27.5rem;
    flex: none;
  }

  @media (max-width: 1000px) {
    gap: ${({ theme }) => theme.spacing.md};

    > aside {
      width: 24rem;
    }
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.sm};

    > aside {
      width: 24.5rem;
    }
  }
`;

const List = styled.div`
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  overflow-y: auto;
  padding: 4px;
  margin: -4px;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) auto;
  gap: ${({ theme }) => theme.spacing.md};
  align-items: center;
  flex: none;
  min-height: 2.75rem;
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  cursor: pointer;

  &[aria-checked='true'] {
    border-color: ${({ theme }) => theme.colors.primary.main};
    box-shadow: 0 0 0 3px ${({ theme }) => theme.colors.primary.border};
  }

  @media (hover: hover) {
    &:hover {
      border-color: ${({ theme }) => theme.colors.primary.main};
    }
  }

  @media (max-height: 500px) {
    grid-template-columns: 2.5rem minmax(0, 1fr) auto;
    gap: ${({ theme }) => theme.spacing.sm};
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.sm}`};
  }
`;

const Art = styled(SongCover)`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 3px;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-height: 500px) {
    width: 2.5rem;
    height: 2.5rem;
  }
`;

const RowText = styled.span`
  display: flex;
  flex-direction: column;
  min-width: 0;

  b {
    ${clampLines(1)}
    font-weight: 600;
    font-size: 1.125rem;
    line-height: 1.5rem;
  }

  span {
    ${clampLines(1)}
    font-size: 0.8125rem;
    line-height: 1.125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    b {
      font-size: 0.9375rem;
      line-height: 1.25rem;
    }
  }
`;

const Tag = styled.span`
  padding: 0.25rem 0.5rem;
  border: 1px solid ${({ theme }) => theme.colors.info.main};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 700;
  font-size: 0.625rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.info.text};
`;

const Empty = styled.p`
  padding: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const PlayButton = styled(Button)`
  min-width: 0;
`;

const SongList: React.FC<{ songs: ShelfSong[]; selected: string; onSelect: (id: string) => void; offline: boolean }> = ({
  songs,
  selected,
  onSelect,
  offline,
}) => {
  const ids = songs.map((s) => s.id);
  const radio = useRadioGroup(ids, ids.includes(selected) ? selected : null, onSelect);
  return (
    <List role="radiogroup" aria-label="Músicas">
      {songs.map((song) => (
        <Row key={song.id} {...radio(song.id)} aria-label={song.title}>
          <Art id={song.id} />
          <RowText>
            <b>{song.title}</b>
            <span>{songMeta(song)}</span>
          </RowText>
          {song.embedded && !offline ? <Tag>No app</Tag> : <span />}
        </Row>
      ))}
    </List>
  );
};

const Details: React.FC<{ song: ShelfSong; mode: GameMode; settings: ReturnType<typeof levelSettings> }> = ({ song, mode, settings }) => {
  const [level, setLevel] = React.useState<Level>(() => startingLevel(song.levels, settings.chartLevel));
  const playable = usePlayableSong(song.id, level);
  return (
    <SongDetails
      song={song}
      level={level}
      onLevel={setLevel}
      playable={playable}
      settings={settings}
      actions={
        <>
          <PlayButton as={Link} to={loadingUrl({ mode, songId: song.id, level })}>
            Tocar <span aria-hidden="true">▸</span>
          </PlayButton>
          <Button as={Link} to={loadingUrl({ mode: 'Prática', songId: song.id, level })} $variant="ghost">
            Praticar trecho
          </Button>
        </>
      }
    />
  );
};

/** 3 · Seleção de música: a estante (catálogo ou as embutidas), busca, dificuldade e Tocar. */
export const SongSelect: React.FC = () => {
  const [search, setSearch] = useSearchParams();
  const mode = modeFromSlug(search.get('modo')) ?? 'Arcade';
  const shelf = useShelf();
  const [query, setQuery] = React.useState('');
  const [settings] = React.useState(() => levelSettings(loadLocalProfile().level ?? DEFAULT_LEVEL));

  // Estante vazia (catálogo sem músicas): as embutidas, como no "Grátis para começar" da biblioteca vazia
  const songs = shelf.status !== 'ready' ? [] : shelf.songs.length ? shelf.songs : [...EMBEDDED_SHELF];
  const visible = songs.filter((s) => matchesSearch(query, s.title, s.composer));
  const wanted = search.get('musica');
  const selected = songs.find((s) => s.id === wanted) ?? songs.find((s) => s.id === settings.firstSongId) ?? songs[0];

  const select = (id: string) =>
    setSearch(
      (params) => {
        params.set('musica', id);
        return params;
      },
      { replace: true }
    );

  return (
    <Screen $gap="1.5rem">
      <Header>
        <Intro>
          <Kicker>Passo 2 de 3 · Modo {mode}</Kicker>
          <ScreenTitle>Selecione a música</ScreenTitle>
        </Intro>
        <Tools>
          <Search label="Buscar música" value={query} onChange={setQuery} />
          <Button as={Link} to={modesUrl(mode === 'Prática' ? 'Arcade' : mode)} $variant="ghost">
            <span aria-hidden="true">◂</span>Voltar
          </Button>
        </Tools>
      </Header>

      {shelf.status === 'ready' && shelf.fallback && <OfflineBanner reason={shelf.reason} count={songs.length} />}

      <Body>
        {shelf.status === 'loading' ? (
          <Empty role="status">Carregando músicas…</Empty>
        ) : (
          <>
            {visible.length ? (
              <SongList songs={visible} selected={selected?.id ?? ''} onSelect={select} offline={shelf.fallback} />
            ) : (
              <Empty role="status">Nenhuma música com “{query.trim()}”.</Empty>
            )}
            {selected && <Details key={selected.id} song={selected} mode={mode} settings={settings} />}
          </>
        )}
      </Body>
    </Screen>
  );
};
