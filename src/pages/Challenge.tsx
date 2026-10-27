import React from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { formatPoints } from '../components/ScoreCard/ScoreCard';
import { clampLines, Kicker } from '../components/Screen/Screen';
import {
  ChallengeError,
  DEADLINE_DAYS,
  useAcceptChallenge,
  useChallenge,
  useChallengeablePlays,
  useCreateChallenge,
  useMyChallenges,
  type Challenge as ChallengeData,
  type ChallengeEntry,
  type ChallengeErrorKind,
  type DeadlineDays,
} from '../services/challenges';
import { copyText, shareLink, type ShareOutcome } from '../services/share';
import { useShelf } from '../services/shelf';
import { challengeLink, challengeUrl, loadingUrl, newChallengeUrl, rankingUrl } from '../shell/choice';
import { DEFAULT_MODE } from '../shell/play';
import { accountUrl, ROUTES } from '../shell/routes';
import { useSession } from '../shell/useAccount';
import { COMPACT_QUERY, useMediaQuery } from '../shell/useMediaQuery';
import { RowAvatar } from './Ranking';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  max-width: 80rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding: 1.875rem 3.5rem;
  overflow: hidden;

  @media (max-height: 500px) {
    gap: 0.5rem;
    padding: 0.625rem max(1rem, env(safe-area-inset-right)) 0.625rem max(1rem, env(safe-area-inset-left));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.25rem;

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }

  h1 {
    ${clampLines(1)}
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.75rem;
    line-height: 2.125rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    align-items: center;

    > div ${Kicker} {
      display: none;
    }

    h1 {
      font-size: 1.375rem;
      line-height: 1.75rem;
    }
  }
`;

/** As três colunas do design 16: convite, montar (ou o desafio aberto) e a lista ao lado. */
const Body = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 1.375rem;

  @media (max-height: 500px) {
    gap: 0.625rem;
  }
`;

/** .ns-panel do design. */
const Panel = styled.section<{ $width?: string }>`
  ${({ $width }) => ($width ? `flex: none; width: ${$width};` : 'flex: 1; min-width: 0;')}
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  padding: 1rem 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};
  overflow-y: auto;

  @media (max-height: 500px) {
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
  }
`;

const Text = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Muted = styled.span`
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

/** Você × desafiante, como no topo do painel do design. */
const Versus = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  > b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 1.75rem;
    line-height: 1;
    color: ${({ theme }) => theme.colors.primary.main};
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  strong {
    ${clampLines(1)}
    font-weight: 600;
    font-size: 1.0625rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    gap: 0.5rem;

    > b {
      font-size: 1.25rem;
    }

    strong {
      font-size: 0.9375rem;
    }
  }
`;

/** Faixa da música (o quadro creme do design). */
const SongBox = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 3.75rem;
  padding: 0.5rem 0.75rem;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  > i {
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    background-color: ${({ theme }) => theme.colors.primary.main};
  }

  > div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  b {
    ${clampLines(1)}
    font-weight: 600;
    font-size: 0.9375rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    min-height: 2.75rem;
    padding: 0.25rem 0.5rem;

    > i {
      width: 1.75rem;
      height: 1.75rem;
    }
  }
`;

const Select = styled.select`
  min-height: 2.75rem;
  width: 100%;
  padding: 0 0.625rem;
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.ui};
  font-size: 0.875rem;
  text-overflow: ellipsis;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;

  @media (max-height: 500px) {
    gap: 0.25rem;

    > ${Kicker} {
      display: none;
    }
  }
`;

/** Prazo (.vh-opt do design), 44 px de toque. */
const Options = styled.div`
  display: flex;
  flex-wrap: wrap;
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
    letter-spacing: 0.06em;
    cursor: pointer;
  }

  button[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.info.main};
    border-color: ${({ theme }) => theme.colors.info.main};
    color: ${({ theme }) => theme.colors.background};
  }
`;

/** Pontos a bater, nível e prazo do desafio aberto. */
const Facts = styled.dl`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;

  > div {
    display: flex;
    flex-direction: column-reverse;
    gap: 0.25rem;
    min-width: 0;
  }

  dd {
    ${clampLines(1)}
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    font-size: 1.5rem;
    line-height: 1.75rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    gap: 0.5rem;

    dd {
      font-size: 1.125rem;
      line-height: 1.375rem;
    }
  }
`;

const Actions = styled.div`
  margin-top: auto;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;

  > :first-child {
    flex: 1;
  }

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
`;

/** O link criado, para copiar à mão se a cópia automática falhar. */
const LinkBox = styled.input`
  min-height: 2.75rem;
  width: 100%;
  padding: 0 0.625rem;
  border: 1px dashed ${({ theme }) => theme.colors.info.main};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.game.track};
  color: ${({ theme }) => theme.colors.info.text};
  font-family: ${({ theme }) => theme.fonts.ui};
  font-size: 0.875rem;
`;

/** Um desafio na lista ao lado (os cartões da coluna "Você foi desafiado"). */
const Card = styled.li<{ $tone: 'warning' | 'plain' }>`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem;
  border: 1px solid ${({ theme, $tone }) => ($tone === 'warning' ? theme.colors.warning.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.sm};

  > span:first-child {
    font-size: 0.875rem;
    line-height: 1.25rem;
    color: ${({ theme }) => theme.colors.text};
  }

  b {
    color: ${({ theme }) => theme.colors.info.text};
  }

  > a {
    align-self: flex-start;
  }

  @media (max-height: 500px) {
    padding: 0.5rem;
    gap: 0.125rem;

    > span:first-child {
      font-size: 0.75rem;
      line-height: 1rem;
    }
  }
`;

const List = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

/** Uma linha do placar: nome gerado, melhor pontuação e o resultado. */
const ScoreLine = styled.li<{ $me: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme, $me }) => ($me ? theme.game.track : 'transparent')};
  box-shadow: ${({ theme, $me }) => ($me ? `inset 3px 0 0 ${theme.colors.primary.main}` : 'none')};

  > div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  b {
    ${clampLines(1)}
    font-weight: 600;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
  }

  > strong {
    font-variant-numeric: tabular-nums;
    font-size: 0.9375rem;
    color: ${({ theme }) => theme.colors.text};
  }
`;

const Status = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.info.text};

  &:empty {
    display: none;
  }

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const DEADLINE_LABEL: Record<DeadlineDays, string> = { 1: '24 h', 2: '48 h', 3: '3 dias', 7: '1 sem.' };
const DEADLINE_SPOKEN: Record<DeadlineDays, string> = { 1: '1 dia', 2: '2 dias', 3: '3 dias', 7: '1 semana' };

const HOUR = 3_600_000;

/** "2 dias restantes", "17 h restantes", "menos de 1 h"; no fim, "Encerrado". */
export function deadlineText(expiresAt: string, closed: boolean, now: number = Date.now()): string {
  const left = Date.parse(expiresAt) - now;
  if (closed || left <= 0) return 'Encerrado';
  if (left < HOUR) return 'menos de 1 h';
  const hours = Math.floor(left / HOUR);
  if (hours < 24) return `${hours} h restantes`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 dia restante' : `${days} dias restantes`;
}

/** O resultado de uma linha do placar do ponto de vista de quem está vendo. */
export function resultText(entry: ChallengeEntry, viewer: 'creator' | 'entrant'): string {
  if (viewer === 'entrant') {
    if (entry.result === 'won') return 'Você venceu!';
    if (entry.result === 'tie') return 'Empate';
    if (entry.result === 'lost') return 'Não foi dessa vez';
    return entry.bestScore === null ? 'Ainda sem partida que conte' : 'Ainda dá para passar';
  }
  if (entry.result === 'won') return 'Passou você';
  if (entry.result === 'tie') return 'Empate';
  if (entry.result === 'lost') return 'Você venceu';
  return entry.bestScore === null ? 'Ainda não tocou' : 'Ainda tentando';
}

const ERROR_TEXT: Record<ChallengeErrorKind, string> = {
  offline: 'Sem conexão. Desafios precisam de internet.',
  'needs-account': 'Desafios pedem uma conta.',
  'not-found': 'Não encontramos esse desafio. Confira o link que você recebeu.',
  refused: 'Esse desafio não pode ser feito agora.',
  server: 'Não foi possível falar com o servidor agora. Tente de novo em instantes.',
};

function errorKindOf(error: unknown): ChallengeErrorKind | null {
  if (!error) return null;
  return error instanceof ChallengeError ? error.kind : 'server';
}

const SHARE_STATUS: Record<ShareOutcome, string> = {
  shared: 'Link enviado.',
  copied: 'Link copiado. Cole na conversa com quem você quer desafiar.',
  downloaded: '',
  cancelled: '',
  failed: 'Não deu para copiar sozinho: selecione o link acima e copie.',
};

/** Os desafios do jogador, na coluna ao lado: os que recebeu (aceitos) e os que mandou, com o resultado. */
const MyChallenges: React.FC<{ width: string }> = ({ width }) => {
  const mine = useMyChallenges();
  const list = mine.data ?? [];
  const kind = errorKindOf(mine.error);
  return (
    <Panel $width={width} aria-label="Seus desafios">
      <Kicker>Seus desafios</Kicker>
      {kind ? (
        <Muted role="status">{ERROR_TEXT[kind]}</Muted>
      ) : !mine.data ? (
        <Muted role="status">Carregando…</Muted>
      ) : !list.length ? (
        <Muted>Nenhum desafio ainda. Os que você mandar e os que aceitar aparecem aqui.</Muted>
      ) : (
        <List>
          {list.map((c) => {
            const own = c.entries?.find((e) => e.me);
            const decided = c.role === 'entrant' ? own?.result : c.entries?.find((e) => e.result)?.result;
            return (
              <Card key={c.code} $tone={c.role === 'entrant' && !c.closed && !decided ? 'warning' : 'plain'}>
                <span>
                  {c.role === 'entrant' ? (
                    <>
                      <b>{c.challengerName}</b> te desafiou em <strong>{c.songTitle}</strong>
                    </>
                  ) : (
                    <>
                      Seu desafio em <strong>{c.songTitle}</strong>
                    </>
                  )}
                </span>
                <Muted>
                  {LEVEL_NAMES[c.level]} · {formatPoints(c.targetScore)} pontos · {deadlineText(c.expiresAt, c.closed)}
                </Muted>
                {c.role === 'entrant' && own ? (
                  <Muted>{resultText(own, 'entrant')}</Muted>
                ) : (
                  <Muted>{c.entries?.length ? `${c.entries.length} aceitaram` : 'Ninguém aceitou ainda'}</Muted>
                )}
                <Button as={Link} to={challengeUrl(c.code)} $variant="link">
                  Abrir <span aria-hidden="true">▸</span>
                </Button>
              </Card>
            );
          })}
        </List>
      )}
    </Panel>
  );
};

const AccountNeeded: React.FC<{ next: string; children: React.ReactNode }> = ({ next, children }) => (
  <>
    <Text>{children}</Text>
    <Muted>Com conta, seu nome no desafio é gerado (bicho + número): nunca o seu apelido nem o e-mail.</Muted>
    <Actions>
      <Button as={Link} to={accountUrl('desafio', next)}>
        Criar conta
      </Button>
    </Actions>
  </>
);

/**
 * 16 · Desafiar um amigo: escolhe um recorde (partida que vale ranking) e o prazo, cria o desafio e manda o link. Sem
 * lista de amigos: o convite é sempre por link, e quem abrir vê só música, nível, pontos, prazo e o nome gerado.
 */
export const Challenge: React.FC = () => {
  const [params] = useSearchParams();
  const compact = useMediaQuery(COMPACT_QUERY);
  const session = useSession();
  const shelf = useShelf();
  const anonymous = session?.status === 'signed-in' && session.anonymous;
  const plays = useChallengeablePlays();
  const create = useCreateChallenge();
  const [playId, setPlayId] = React.useState<string | null>(params.get('partida'));
  const [days, setDays] = React.useState<DeadlineDays>(2);
  const [shared, setShared] = React.useState<ShareOutcome | null>(null);
  const titles = new Map((shelf.status === 'ready' ? shelf.songs : []).map((s) => [s.id, s.title]));
  const options = plays.data ?? [];
  const chosen = options.find((p) => p.playId === playId) ?? options[0] ?? null;
  const created = create.data && create.data.code ? create.data : null;
  const here = newChallengeUrl(chosen?.playId ?? undefined);
  const playsError = errorKindOf(plays.error);
  const createError = errorKindOf(create.error);
  const link = created ? challengeLink(created.code) : null;
  const titleOf = (songId: string) => titles.get(songId) ?? songId;

  const send = async () => {
    if (!created || !link) return;
    setShared(
      await shareLink(link, {
        title: 'Desafio no Violin Hero',
        text: `Consegue passar ${formatPoints(created.targetScore)} pontos em ${created.songTitle} (${LEVEL_NAMES[created.level]})?`,
      })
    );
  };

  let center: React.ReactNode;
  if (anonymous) {
    center = <AccountNeeded next={here}>Desafiar alguém pede uma conta: o desafio guarda o seu placar e mostra o resultado para os dois.</AccountNeeded>;
  } else if (playsError) {
    center = <Text role="status">{ERROR_TEXT[playsError]}</Text>;
  } else if (!plays.data) {
    center = <Text role="status">Carregando seus recordes…</Text>;
  } else if (!chosen) {
    center = (
      <>
        <Text>Toque uma música até o fim, fora da prática, para desafiar alguém com o seu placar.</Text>
        <Actions>
          <Button as={Link} to={ROUTES.modes}>
            Tocar
          </Button>
        </Actions>
      </>
    );
  } else if (created && link) {
    center = (
      <>
        <Versus>
          <RowAvatar name="Você" size={compact ? 2.25 : 3.5} />
          <b aria-hidden="true">VS</b>
          <div>
            <strong>Desafio criado</strong>
            <Muted>
              {created.songTitle} · {LEVEL_NAMES[created.level]} · {formatPoints(created.targetScore)} pontos · {deadlineText(created.expiresAt, created.closed)}
            </Muted>
          </div>
        </Versus>
        <Field>
          <Kicker as="label" htmlFor="desafio-link">
            Link do desafio
          </Kicker>
          <LinkBox id="desafio-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </Field>
        <Status role="status">{shared ? SHARE_STATUS[shared] : ''}</Status>
        <Actions>
          <Button type="button" onClick={() => void send()}>
            Mandar link <span aria-hidden="true">▸</span>
          </Button>
          <Button type="button" $variant="ghost" onClick={() => void copyText(link).then(setShared)}>
            Copiar
          </Button>
          <Button as={Link} to={challengeUrl(created.code)} $variant="ghost">
            Ver desafio
          </Button>
        </Actions>
      </>
    );
  } else {
    center = (
      <>
        <Versus>
          <RowAvatar name="Você" size={compact ? 2.25 : 3.5} />
          <b aria-hidden="true">VS</b>
          <div>
            <strong>Você × quem aceitar</strong>
            <Muted>Quem fizer mais pontos até o prazo vence</Muted>
          </div>
        </Versus>
        <Field>
          <Kicker as="label" htmlFor="desafio-partida">
            Música
          </Kicker>
          <SongBox>
            <i aria-hidden="true" />
            <div>
              <Select id="desafio-partida" aria-label="Música e nível" value={chosen.playId} onChange={(e) => setPlayId(e.target.value)}>
                {options.map((p) => (
                  <option key={p.playId} value={p.playId}>
                    {titleOf(p.songId)} · {LEVEL_NAMES[p.level]} · {formatPoints(p.score)} pontos
                  </option>
                ))}
              </Select>
            </div>
          </SongBox>
          {!compact && <Muted>O seu recorde vira os pontos a bater, nesta música e neste nível.</Muted>}
        </Field>
        <Field>
          <Kicker id="desafio-prazo">Prazo</Kicker>
          <Options role="group" aria-labelledby="desafio-prazo">
            {DEADLINE_DAYS.map((d) => (
              <button key={d} type="button" aria-pressed={days === d} aria-label={DEADLINE_SPOKEN[d]} onClick={() => setDays(d)}>
                {DEADLINE_LABEL[d]}
              </button>
            ))}
          </Options>
        </Field>
        <Status role="status">{createError ? ERROR_TEXT[createError] : ''}</Status>
        <Actions>
          <Button type="button" disabled={create.isPending} onClick={() => create.mutate({ playId: chosen.playId, days })}>
            Criar desafio <span aria-hidden="true">▸</span>
          </Button>
        </Actions>
      </>
    );
  }

  return (
    <Page>
      <Header>
        <div>
          <Kicker>Social</Kicker>
          <h1>Desafiar um amigo</h1>
        </div>
        <Button as={Link} to={rankingUrl()} $variant="ghost">
          <span aria-hidden="true">◂</span>
          Ranking
        </Button>
      </Header>
      <Body>
        {!compact && (
          <Panel $width="19rem" aria-label="Convidar por link">
            <Kicker>Por link</Kicker>
            <Text>Crie o desafio e mande o link para quem você quiser: pela conversa, pelo grupo da turma ou pelo cartão do resultado.</Text>
            <Muted>Quem abrir vê a música, o nível, os pontos a bater, o prazo e o seu nome gerado. Para aceitar, precisa de conta.</Muted>
            <Muted>Vale a melhor partida de quem aceitou, nesta música e neste nível, até o fim do prazo.</Muted>
          </Panel>
        )}
        <Panel aria-label="Montar desafio">{center}</Panel>
        {!anonymous && <MyChallenges width={compact ? '15rem' : '18.75rem'} />}
      </Body>
    </Page>
  );
};

/** O placar das partes: o desafiante vê todos que aceitaram; quem aceitou, a própria linha. */
const Scoreboard: React.FC<{ challenge: ChallengeData }> = ({ challenge }) => {
  const viewer = challenge.role === 'creator' ? 'creator' : 'entrant';
  const entries = challenge.entries ?? [];
  return (
    <>
      <Kicker>Placar · {formatPoints(challenge.targetScore)} a bater</Kicker>
      {!entries.length ? (
        <Muted>Ninguém aceitou ainda. Mande o link de novo se quiser.</Muted>
      ) : (
        <List aria-label="Placar">
          {entries.map((e) => (
            <ScoreLine key={`${e.name}-${e.acceptedAt}`} $me={e.me} aria-current={e.me ? 'true' : undefined}>
              <RowAvatar name={e.name} size={2.125} />
              <div>
                <b>
                  {e.name}
                  {e.me && ' · você'}
                </b>
                <Muted>{resultText(e, viewer)}</Muted>
              </div>
              <strong>{e.bestScore === null ? '—' : formatPoints(e.bestScore)}</strong>
            </ScoreLine>
          ))}
        </List>
      )}
    </>
  );
};

/**
 * O link do desafio (/desafio/<código>): abre para qualquer um com música, nível, pontos a bater, prazo e o nome
 * gerado do desafiante. Aceitar pede conta; depois de aceitar, "Tocar agora" leva direto à música e ao nível, e o
 * placar mostra o resultado que o servidor calcula a partir das partidas.
 */
export const ChallengeInvite: React.FC = () => {
  const { codigo = '' } = useParams();
  const compact = useMediaQuery(COMPACT_QUERY);
  const session = useSession();
  const challenge = useChallenge(codigo);
  const accept = useAcceptChallenge();
  const [shared, setShared] = React.useState<ShareOutcome | null>(null);
  const anonymous = session?.status === 'signed-in' && session.anonymous;
  const data = challenge.data;
  const kind = errorKindOf(challenge.error);
  const acceptError = errorKindOf(accept.error);
  const here = challengeUrl(codigo);

  let body: React.ReactNode;
  if (kind) {
    body = (
      <Panel aria-label="Desafio">
        <Text role="status">{ERROR_TEXT[kind]}</Text>
        {kind === 'server' && (
          <Actions>
            <Button type="button" $variant="ghost" onClick={() => void challenge.refetch()}>
              Tentar de novo
            </Button>
          </Actions>
        )}
      </Panel>
    );
  } else if (!data) {
    body = (
      <Panel aria-label="Desafio">
        <Text role="status">Carregando o desafio…</Text>
      </Panel>
    );
  } else {
    const play = loadingUrl({ mode: DEFAULT_MODE, songId: data.songId, level: data.level });
    const party = data.role !== 'visitor';
    let actions: React.ReactNode;
    if (data.role === 'creator') {
      const link = challengeLink(data.code);
      actions = (
        <>
          <Status role="status">{shared ? SHARE_STATUS[shared] : ''}</Status>
          <Actions>
            <Button
              type="button"
              disabled={data.closed}
              onClick={() =>
                void shareLink(link, { title: 'Desafio no Violin Hero', text: `Consegue passar ${formatPoints(data.targetScore)} pontos em ${data.songTitle}?` }).then(setShared)
              }
            >
              Mandar link <span aria-hidden="true">▸</span>
            </Button>
            <Button as={Link} to={ROUTES.challenge} $variant="ghost">
              Novo desafio
            </Button>
          </Actions>
        </>
      );
    } else if (data.closed) {
      actions = (
        <Actions>
          <Button as={Link} to={ROUTES.challenge} $variant="ghost">
            {data.role === 'entrant' ? 'Desafiar de volta' : 'Criar o meu desafio'}
          </Button>
        </Actions>
      );
    } else if (data.role === 'entrant') {
      actions = (
        <>
          <Muted>Vale a sua melhor partida nesta música e neste nível, fora da prática, até o fim do prazo.</Muted>
          <Actions>
            <Button as={Link} to={play}>
              Tocar agora <span aria-hidden="true">▸</span>
            </Button>
          </Actions>
        </>
      );
    } else if (anonymous) {
      actions = <AccountNeeded next={here}>Para aceitar, crie uma conta. Você continua com tudo o que já tocou neste aparelho.</AccountNeeded>;
    } else {
      actions = (
        <>
          <Status role="status">{acceptError ? ERROR_TEXT[acceptError] : ''}</Status>
          <Actions>
            <Button type="button" disabled={accept.isPending} onClick={() => accept.mutate(data.code)}>
              Aceitar desafio <span aria-hidden="true">▸</span>
            </Button>
          </Actions>
        </>
      );
    }

    body = (
      <>
        <Panel aria-label="Desafio">
          <Versus>
            <RowAvatar name={data.challengerName} size={compact ? 2.25 : 3.5} />
            <b aria-hidden="true">VS</b>
            <RowAvatar name={data.role === 'creator' ? '?' : 'Você'} size={compact ? 2.25 : 3.5} />
            <div>
              <strong>{data.role === 'creator' ? 'Você × quem aceitar' : `${data.challengerName} × você`}</strong>
              <Muted>Quem fizer mais pontos até o prazo vence</Muted>
            </div>
          </Versus>
          <SongBox>
            <i aria-hidden="true" />
            <div>
              <b>{data.songTitle}</b>
              <Muted>{LEVEL_NAMES[data.level]}</Muted>
            </div>
          </SongBox>
          <Facts>
            <div>
              <dd>{formatPoints(data.targetScore)}</dd>
              <Kicker as="dt">Pontos a bater</Kicker>
            </div>
            <div>
              <dd>{LEVEL_NAMES[data.level]}</dd>
              <Kicker as="dt">Nível</Kicker>
            </div>
            <div>
              <dd>{deadlineText(data.expiresAt, data.closed)}</dd>
              <Kicker as="dt">Prazo</Kicker>
            </div>
          </Facts>
          {actions}
        </Panel>
        {party && (
          <Panel $width={compact ? '15rem' : '18.75rem'} aria-label="Placar do desafio">
            <Scoreboard challenge={data} />
          </Panel>
        )}
      </>
    );
  }

  return (
    <Page>
      <Header>
        <div>
          <Kicker>Desafio</Kicker>
          <h1>{data ? (data.role === 'creator' ? 'Seu desafio' : `${data.challengerName} te desafiou`) : 'Desafio'}</h1>
        </div>
        <Button as={Link} to={ROUTES.home} $variant="ghost">
          <span aria-hidden="true">◂</span>
          Menu
        </Button>
      </Header>
      <Body>{body}</Body>
    </Page>
  );
};
