import React from 'react';
import { BackLink, navigationPageInsets } from '../components/BackLink/BackLink';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import styled, { css } from 'styled-components';
import { ANIMAL_LOOK } from '../components/AvatarPicker/AvatarPicker';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { formatPercent, formatPoints } from '../components/ScoreCard/ScoreCard';
import { clampLines, Kicker } from '../components/Screen/Screen';
import type { StringName } from '../assets/styles/themes';
import { rgba } from '../assets/styles/themes/color';
import { BADGES } from '../game/engine';
import { LEVELS, type Level } from '../game/notation/song';
import { ProgressError } from '../services/progress';
import { rankingKeys, RANKING_LIMIT, useLastRankedPlay, useRanking, type RankingPeriod, type RankingRow } from '../services/ranking';
import { useShelf } from '../services/shelf';
import { playSync } from '../services/sync';
import { modesUrl, parseRankingUrl, rankingUrl } from '../shell/choice';
import { useProgress } from '../shell/progress';
import { accountUrl } from '../shell/routes';
import { useSession } from '../shell/useAccount';
import { COMPACT_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { goalFor } from './Profile';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  overflow: hidden;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
  ${navigationPageInsets}
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;

  > div:first-child {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.75rem;
    line-height: 2.125rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    align-items: flex-start;
    gap: 0.75rem;

    > div:first-child ${Kicker} {
      display: none;
    }

    h1 {
      font-size: 1.375rem;
      line-height: 1.75rem;
    }
  }
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;

  @media (max-height: 500px) {
    gap: 0.375rem;

    > a {
      padding: 0 0.75rem;
    }
  }
`;

/** Semana / Geral (.vh-tab do design); 44 px de toque. */
const Tabs = styled.div`
  display: flex;
  gap: 0.375rem;

  button {
    min-height: 2.75rem;
    padding: 0 0.875rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    background: transparent;
    color: ${({ theme }) => theme.colors.textMuted};
    font-family: ${({ theme }) => theme.fonts.ui};
    font-weight: 600;
    font-size: 0.75rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    border: 2px solid ${({ theme }) => theme.colors.info.main};
    background-color: ${({ theme }) => theme.colors.info.surface};
    color: ${({ theme }) => theme.colors.info.text};
  }

  @media (max-height: 500px) {
    button {
      padding: 0 0.625rem;
    }
  }
`;

/** Música e nível (.vh-sel); o rótulo fica só para o leitor de tela, como no design. */
const Select = styled.select<{ $wide?: boolean }>`
  min-height: 2.75rem;
  max-width: ${({ $wide }) => ($wide ? '15rem' : '7.5rem')};
  padding: 0 0.625rem;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.ui};
  font-size: 0.875rem;
  text-overflow: ellipsis;

  @media (max-height: 500px) {
    max-width: ${({ $wide }) => ($wide ? '11rem' : '6rem')};
  }
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.25rem;

  > div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
`;

const Podium = styled.ol`
  display: grid;
  grid-template-columns: 1fr 1.12fr 1fr;
  gap: 0.875rem;
  align-items: end;
`;

/** Degraus do pódio (236, 210 e 198 px no design), com folga para o nome não cortar com a fonte de reserva. */
const PLACE_HEIGHT = { 1: 14, 2: 12.75, 3: 12 } as const;

const Place = styled.li<{ $rank: 1 | 2 | 3; $me: boolean }>`
  height: ${({ $rank }) => PLACE_HEIGHT[$rank]}rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 0.375rem;
  min-width: 0;
  padding: 0.75rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme, $rank, $me }) => ($me ? theme.colors.primary.main : $rank === 1 ? theme.colors.warning.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};

  > b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 1.375rem;
    line-height: 1;
    color: ${({ theme, $rank }) => ($rank === 1 ? theme.colors.warning.text : $rank === 2 ? theme.colors.text : theme.colors.primary.main)};
  }

  > strong {
    font-variant-numeric: tabular-nums;
    font-size: 1.25rem;
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Name = styled.span`
  ${clampLines(1)}
  max-width: 100%;
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.text};
`;

const Muted = styled.span`
  font-size: 0.75rem;
  line-height: 1rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** Bola do bicho (cor da corda dele), como o avatar do Perfil; nome sem bicho conhecido fica com VH. */
const Avatar = styled.span<{ $string: StringName | null; $size: number }>`
  flex: none;
  width: ${({ $size }) => $size}rem;
  height: ${({ $size }) => $size}rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme, $string }) => ($string ? rgba(theme.game.strings[$string].main, 0.22) : theme.colors.primary.main)};
  color: ${({ theme }) => theme.colors.primary.text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: ${({ $size }) => $size * 0.4}rem;
  line-height: 1;
`;

const Board = styled.section`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  overflow: hidden;
`;

const rowGrid = css`
  display: grid;
  grid-template-columns: 2.75rem 2.25rem minmax(0, 1fr) 5.5rem 7.5rem;
  gap: 0.75rem;
  align-items: center;
  padding: 0 0.875rem;

  @media (max-height: 500px) {
    grid-template-columns: 2rem 2.125rem minmax(0, 1fr) 4.5rem 6rem;
    gap: 0.5rem;
  }
`;

const Columns = styled.div`
  ${rowGrid}
  min-height: 2rem;
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.14em;
  color: ${({ theme }) => theme.colors.textMuted};
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  > span:nth-child(n + 4) {
    text-align: right;
  }
`;

/** Cabeçalho e linhas; só as linhas rolam. */
const Table = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const Rows = styled.div`
  min-height: 0;
  overflow-y: auto;
`;

const Row = styled.div<{ $me?: boolean }>`
  ${rowGrid}
  min-height: 2.875rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  > span:first-child {
    font-variant-numeric: tabular-nums;
    font-size: 1.25rem;
    color: ${({ theme, $me }) => ($me ? theme.colors.primary.main : theme.colors.textMuted)};
  }

  > span:nth-child(n + 4) {
    font-variant-numeric: tabular-nums;
    font-size: 0.9375rem;
    text-align: right;
    color: ${({ theme }) => theme.colors.text};
  }

  ${({ theme, $me }) =>
    $me &&
    css`
      background-color: ${theme.colors.surface};
      box-shadow: inset 3px 0 0 ${theme.colors.primary.main};
    `}

  @media (max-height: 500px) {
    min-height: 2.75rem;

    > span:first-child {
      font-size: 1rem;
    }

    > span:nth-child(n + 4) {
      font-size: 0.8125rem;
    }
  }
`;

/** Rodapé do quadro: a linha do jogador fora do topo, o convite para criar conta ou para tocar. */
const Foot = styled.div`
  margin-top: auto;
  border-top: 1px solid ${({ theme }) => theme.colors.primary.main};
  background-color: ${({ theme }) => theme.colors.surface};
  box-shadow: inset 3px 0 0 ${({ theme }) => theme.colors.primary.main};

  > p {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 3.375rem;
    padding: 0.375rem 0.875rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: ${({ theme }) => theme.colors.text};
  }

  > p > span {
    flex: 1;
    min-width: 0;
  }

  ${Row} {
    border-bottom: 0;
    min-height: 3.375rem;
  }

  @media (max-height: 500px) {
    > p {
      gap: 0.5rem;
      min-height: 2.75rem;
      padding: 0 0.5rem 0 0.875rem;
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
`;

const Message = styled.p`
  padding: 1rem 0.875rem;
  font-size: 0.9375rem;
  line-height: 1.375rem;
  color: ${({ theme }) => theme.colors.textMuted};

  /* Vazio, a região de aviso fica no lugar (o leitor de tela anuncia quando ela muda), sem ocupar espaço */
  &:empty {
    padding: 0;
  }

  @media (max-height: 500px) {
    padding: 0.5rem 0.875rem;
    font-size: 0.8125rem;
    line-height: 1.125rem;
  }
`;

const You = styled.span`
  color: ${({ theme }) => theme.colors.primary.main};
  font-weight: 700;
`;

/** Seus selos (.ns-panel do design): os que o jogador tem, os que faltam e a próxima meta. */
const Aside = styled.aside`
  flex: none;
  width: 22.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};
  overflow-y: auto;

  > div:first-child {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  ul {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.375rem;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0.625rem 0.25rem;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    background-color: ${({ theme }) => theme.game.track};
    text-align: center;
    font-weight: 600;
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${({ theme }) => theme.colors.text};
  }

  li[data-locked] {
    background-color: transparent;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Next = styled.div`
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px dashed ${({ theme }) => theme.colors.warning.main};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  b {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.warning.text};
  }
`;

/** O bicho do nome público ("Raposa 1234"): a cor e o desenho do avatar. */
function lookOf(name: string) {
  return Object.values(ANIMAL_LOOK).find((look) => name.startsWith(`${look.name} `)) ?? null;
}

/** Avatar do nome público; o Desafio usa o mesmo. */
export const RowAvatar: React.FC<{ name: string; size: number }> = ({ name, size }) => {
  const look = lookOf(name);
  return (
    <Avatar $string={look?.string ?? null} $size={size} aria-hidden="true">
      {look ? look.emoji : 'VH'}
    </Avatar>
  );
};

const PERIOD_LABEL: Record<RankingPeriod, string> = { week: 'Semana', all: 'Geral' };

const RankingLine: React.FC<{ row: RankingRow }> = ({ row }) => (
  <Row role="row" $me={row.me} aria-current={row.me ? 'true' : undefined}>
    <span role="cell">{row.rank}</span>
    <span role="cell">
      <RowAvatar name={row.name} size={2.125} />
    </span>
    <Name role="cell">
      {row.name}
      {row.me && <You> · você</You>}
    </Name>
    <span role="cell">{formatPercent(row.accuracy)}</span>
    <span role="cell">{formatPoints(row.points)}</span>
  </Row>
);

/** O pódio na ordem do design: 2º, 1º, 3º. */
const PODIUM_ORDER = [2, 1, 3] as const;

/**
 * 13 · Ranking: por música e nível, da semana (de segunda, em Brasília) ou geral. Uma linha por conta, com a melhor
 * partida; o nome é o do ranking (bicho + número). Convidado vê a lista e o convite para criar conta; com conta, a
 * linha dele aparece destacada, ou no rodapé quando está fora do topo.
 */
export const Ranking: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const compact = useMediaQuery(COMPACT_QUERY);
  const chosen = parseRankingUrl(params);
  const shelf = useShelf();
  const session = useSession();
  const progress = useProgress();
  // Sem música no endereço, abre a última jogada que vale ranking; sem nenhuma, a primeira da estante
  const last = useLastRankedPlay();
  const songs = shelf.status === 'ready' ? shelf.songs : [];
  const waiting = !chosen.songId && last.isPending;
  const songId = chosen.songId ?? last.data?.songId ?? songs[0]?.id ?? null;
  const level: Level = chosen.level ?? (last.data?.songId === songId ? last.data.level : 'easy');
  const period: RankingPeriod = chosen.period ?? 'week';
  const ranking = useRanking(songId && !waiting ? { songId, level, period } : null);
  const here = rankingUrl({ songId: songId ?? undefined, level, period });

  // Partida que a fila acabou de subir (vinda do Resultado) entra na hora
  React.useEffect(() => playSync.subscribe(() => void queryClient.invalidateQueries({ queryKey: rankingKeys.all })), [queryClient]);

  const choose = (change: { songId?: string; level?: Level; period?: RankingPeriod }) =>
    navigate(rankingUrl({ songId: songId ?? undefined, level, period, ...change }), { replace: true });

  const song = songs.find((s) => s.id === songId);
  const levels = song && song.levels.length && !song.embedded ? song.levels : LEVELS;
  const rows = ranking.data?.rows ?? [];
  const anonymous = ranking.data?.anonymous ?? (session?.status === 'signed-in' && session.anonymous);
  const top = rows.filter((r) => r.rank <= RANKING_LIMIT);
  const mine = rows.find((r) => r.me);
  const podium = compact ? [] : top.filter((r) => r.rank <= 3);
  const listed = compact ? top : top.filter((r) => r.rank > 3);
  const owned = new Set(progress.badges);
  const nextBadge = BADGES.find((b) => !owned.has(b.id));
  const levelName = LEVEL_NAMES[level];
  const error = ranking.error instanceof ProgressError ? ranking.error.kind : ranking.error ? 'server' : null;

  let message: string | null = null;
  if (!songId && !waiting && shelf.status === 'ready') message = 'Nenhuma música na estante ainda.';
  else if (error === 'offline') message = 'Sem conexão. O ranking precisa de internet; suas partidas sobem quando a rede voltar.';
  else if (error === 'not-found') message = `Esta música não tem o nível ${levelName}. Escolha outro nível.`;
  else if (error) message = 'Não foi possível carregar o ranking agora. Tente de novo em instantes.';
  else if (!ranking.data) message = 'Carregando o ranking…';
  else if (!top.length)
    message =
      period === 'week'
        ? `Ninguém entrou no ranking desta semana no ${levelName} ainda. A semana começa na segunda.`
        : `Ninguém entrou neste ranking no ${levelName} ainda. Toque até o fim e seja o primeiro.`;

  return (
    <Page>
      <Header>
        <div>
          <Kicker>Os melhores violinistas</Kicker>
          <h1>Ranking</h1>
        </div>
        <Controls>
          <Tabs role="group" aria-label="Período">
            {(['week', 'all'] as const).map((p) => (
              <button key={p} type="button" aria-pressed={period === p} onClick={() => choose({ period: p })}>
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </Tabs>
          <label>
            <span className="sr-only">Música</span>
            <Select $wide value={songId ?? ''} onChange={(e) => choose({ songId: e.target.value })} disabled={!songs.length}>
              {songId && !song && <option value={songId}>{songId}</option>}
              {songs.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </label>
          <label>
            <span className="sr-only">Nível</span>
            <Select value={level} onChange={(e) => choose({ level: e.target.value as Level })}>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_NAMES[l]}
                </option>
              ))}
            </Select>
          </label>
          <BackLink />
        </Controls>
      </Header>

      <Body>
        <div>
          {podium.length > 0 && (
            <Podium aria-label="Pódio">
              {PODIUM_ORDER.map((rank) => {
                const row = podium.find((r) => r.rank === rank);
                if (!row) return <li key={rank} aria-hidden="true" />;
                return (
                  <Place key={rank} $rank={rank} $me={row.me} aria-current={row.me ? 'true' : undefined}>
                    <b>{rank}º</b>
                    <RowAvatar name={row.name} size={3.25} />
                    <Name>
                      {row.name}
                      {row.me && <You> · você</You>}
                    </Name>
                    <Muted>{formatPercent(row.accuracy)} de precisão</Muted>
                    <strong>{formatPoints(row.points)}</strong>
                  </Place>
                );
              })}
            </Podium>
          )}

          <Board aria-label="Classificação">
            <Table role="table" aria-label={`Ranking ${PERIOD_LABEL[period].toLowerCase()} · ${song?.title ?? 'música'} · ${levelName}`}>
              <Columns role="row">
                <span role="columnheader">#</span>
                <span role="columnheader">
                  <span className="sr-only">Bicho</span>
                </span>
                <span role="columnheader">VIOLINISTA</span>
                <span role="columnheader">PRECISÃO</span>
                <span role="columnheader">PONTOS</span>
              </Columns>
              <Rows role="rowgroup" tabIndex={listed.length > 6 ? 0 : undefined}>
                {listed.map((row) => (
                  <RankingLine key={row.rank} row={row} />
                ))}
              </Rows>
            </Table>
            <Message role="status">{message}</Message>
            {error === 'server' && (
              <Message as="div">
                <Button type="button" $variant="ghost" onClick={() => void ranking.refetch()}>
                  Tentar de novo
                </Button>
              </Message>
            )}
            {ranking.data && songId && (
              <Foot>
                {anonymous ? (
                  <p>
                    <span>Você está jogando sem conta. Crie uma para entrar no ranking com um nome de bicho e número, nunca o seu apelido nem o e-mail.</span>
                    <Button as={Link} to={accountUrl('ranking', here)}>
                      Criar conta
                    </Button>
                  </p>
                ) : mine && mine.rank > RANKING_LIMIT ? (
                  <div role="table" aria-label="Sua posição">
                    <RankingLine row={mine} />
                  </div>
                ) : !mine ? (
                  <p>
                    <span>Você ainda não está neste ranking. Toque esta música no {levelName} até o fim, fora da prática, para entrar.</span>
                    <Button as={Link} to={modesUrl(undefined, songId)} $variant="ghost">
                      Tocar
                    </Button>
                  </p>
                ) : null}
              </Foot>
            )}
          </Board>
        </div>

        {!compact && (
          <Aside aria-label="Seus selos">
            <div>
              <Kicker>Seus selos</Kicker>
              <Muted>
                {owned.size} de {BADGES.length}
              </Muted>
            </div>
            <Muted as="p">Todo selo é ganho tocando: aparece no fim da partida em que você conseguiu.</Muted>
            <ul>
              {BADGES.map((b) => (
                <li key={b.id} data-locked={owned.has(b.id) ? undefined : ''}>
                  <Badge kind={b.kind} label={b.label} size={32} locked={!owned.has(b.id)} />
                  {b.label}
                </li>
              ))}
            </ul>
            {nextBadge && (
              <Next>
                <Badge kind={nextBadge.kind} label={nextBadge.label} size={32} locked decorative />
                <div>
                  <b>Próximo: {nextBadge.label}</b>
                  <Muted>{goalFor(nextBadge)}</Muted>
                </div>
              </Next>
            )}
          </Aside>
        )}
      </Body>
    </Page>
  );
};
