import React from 'react';
import { BackLink, navigationPageInsets } from '../components/BackLink/BackLink';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { ANIMAL_LOOK } from '../components/AvatarPicker/AvatarPicker';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { Kicker } from '../components/Screen/Screen';
import type { StringName } from '../assets/styles/themes';
import { rgba } from '../assets/styles/themes/color';
import { BADGES, type Badge as BadgeInfo, type BadgeId } from '../game/engine';
import { GOLD_TUNING_CENTS } from '../game/engine/badges';
import { shiftDay } from '../services/history';
import { todayInBrazil } from '../services/progress';
import { useShelf } from '../services/shelf';
import { modesUrl } from '../shell/choice';
import { useProgress } from '../shell/progress';
import { formatDuration, lastDays, LEARNED_ACCURACY, learnedSongs, markedDays, stringTrend, tuningAverage } from '../shell/progressStats';
import { ROUTES } from '../shell/routes';
import { LEVEL_INFO } from './OnboardLevel';
import { settingsUrl } from './Settings';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  overflow: hidden;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
  ${navigationPageInsets}
`;

const Header = styled.header`
  display: flex;
  align-items: flex-start;
  gap: 1.25rem;

  > nav {
    margin-left: auto;
    display: flex;
    gap: 0.75rem;
  }

  @media (max-height: 500px) {
    gap: 0.75rem;

    > nav {
      gap: 0.5rem;
    }

    > nav > * {
      padding: 0 0.75rem;
    }
  }
`;

/** Na cor da corda do bicho; sem bicho, as iniciais no magenta do jogo. */
const Avatar = styled.span<{ $string: StringName | null }>`
  flex: none;
  width: 4.5rem;
  height: 4.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme, $string }) => ($string ? rgba(theme.game.strings[$string].main, 0.22) : theme.colors.primary.main)};
  color: ${({ theme }) => theme.colors.primary.text};
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 1.625rem;
  line-height: 1;

  @media (max-height: 500px) {
    width: 2.75rem;
    height: 2.75rem;
    font-size: 1.125rem;
  }
`;

const Who = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: min(26.25rem, 40vw);
  min-width: 0;

  > div {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    min-width: 0;
  }

  h1 {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.625rem;
    line-height: 1.875rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    gap: 0.25rem;

    h1 {
      font-size: 1.25rem;
      line-height: 1.5rem;
    }
  }
`;

const Pill = styled.span`
  flex: none;
  padding: 0.25rem 0.625rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 1.5px solid ${({ theme }) => theme.colors.warning.main};
  background-color: ${({ theme }) => theme.colors.warning.surface};
  color: ${({ theme }) => theme.colors.warning.text};
  font-weight: 700;
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  white-space: nowrap;
`;

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  > div {
    flex: 1;
    height: 0.5rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
    overflow: hidden;
  }

  i {
    display: block;
    height: 100%;
    background-color: ${({ theme }) => theme.colors.info.main};
  }

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

/** `warning`: a borda âmbar da Sequência acesa. */
const Card = styled.section<{ $tone?: 'warning' }>`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
  padding: 1rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme, $tone }) => ($tone ? theme.colors.warning.main : theme.colors.surfaceBorder)};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    padding: 0.5rem 0.75rem;
    gap: 0.125rem;
  }
`;

const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1rem;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
`;

const Big = styled.span<{ $tone?: 'warning' }>`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 2rem;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: ${({ theme, $tone }) => ($tone ? theme.colors.warning.text : theme.colors.text)};

  small {
    font-size: 1.125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    font-size: 1.25rem;

    small {
      font-size: 0.875rem;
    }
  }
`;

/** `$wrap`: frase que pode quebrar linha (no rodapé dos painéis). */
const Sub = styled.span<{ $wrap?: boolean }>`
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: ${({ $wrap }) => ($wrap ? 'normal' : 'nowrap')};
  overflow: hidden;
  text-overflow: ellipsis;

  &[data-foot] {
    margin-top: auto;
  }

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Panels = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.1fr 1fr 1fr;
  gap: 1rem;

  > section {
    min-height: 0;
    overflow-y: auto;
  }

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
`;

const PanelHead = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
`;

const Letter = styled.span<{ $string: StringName }>`
  color: ${({ theme, $string }) => theme.game.strings[$string].main};
`;

const Trend = styled.svg<{ $string: StringName }>`
  polyline {
    fill: none;
    stroke: ${({ theme, $string }) => theme.game.strings[$string].main};
    stroke-width: 2.5;
    vector-effect: non-scaling-stroke;
  }
`;

/** "Próxima meta" no ciano de informação, como no design. */
const InfoKicker = styled(Kicker)`
  color: ${({ theme }) => theme.colors.info.text};
`;

/** Os 7 dias da sequência (.vh-stat do design): cheio = tocou; o de hoje tracejado enquanto não tocar. */
const Week = styled.div`
  display: flex;
  gap: 0.375rem;

  i {
    flex: 1;
    height: 0.5rem;
    background-color: ${({ theme }) => theme.colors.warning.main};
  }

  i[data-off] {
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  i[data-today] {
    border: 1.5px dashed ${({ theme }) => theme.colors.warning.main};
    background-color: transparent;
  }
`;

/** Minutos por dia (.vh-bars): 14 barras, a de hoje em ciano. */
const Bars = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 0.375rem;
  height: 8.125rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  i {
    flex: 1;
    min-height: 2px;
    background-color: ${({ theme }) => theme.game.strings.G.main};
    opacity: 0.85;
  }

  i[data-empty] {
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  i[data-today] {
    background-color: ${({ theme }) => theme.colors.info.main};
    opacity: 1;
  }

  @media (max-height: 500px) {
    height: 3rem;
    gap: 0.1875rem;
  }
`;

const Axis = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** Afinação por corda (.vh-srow): letra na cor da corda, a linha das 4 semanas e "antes → agora". */
const StringRow = styled.div`
  display: grid;
  grid-template-columns: 1.375rem minmax(0, 1fr) 6rem;
  align-items: center;
  gap: 0.75rem;

  > span {
    font-family: ${({ theme }) => theme.fonts.display};
    font-size: 1.125rem;
    line-height: 1;
  }

  svg {
    display: block;
    width: 100%;
    height: 2.125rem;
  }

  b {
    font-weight: 400;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    grid-template-columns: 1rem minmax(0, 1fr) 4.5rem;
    gap: 0.375rem;

    svg {
      height: 1.25rem;
    }

    b {
      font-size: 0.75rem;
    }
  }
`;

const Next = styled.div`
  margin-top: auto;
  padding-top: 0.75rem;
  border-top: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
  display: flex;
  align-items: center;
  gap: 0.75rem;

  > div {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    padding-top: 0.375rem;
  }
`;

const Achievements = styled.ul`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.625rem;

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.5rem;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
    background-color: ${({ theme }) => theme.game.track};
    text-align: center;
    font-weight: 600;
    font-size: 0.75rem;
    line-height: 1rem;
    color: ${({ theme }) => theme.colors.text};
  }

  li[data-locked] {
    border-style: dashed;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: 0.375rem;

    li {
      flex-direction: row;
      padding: 0.25rem 0.375rem;
      text-align: left;
    }
  }
`;

const Empty = styled.p`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

/** "Ver todos" da coleção: texto pequeno no cabeçalho do painel, com a área de toque de 44 px sem mexer no layout. */
const SeeAll = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  min-height: 2.75rem;
  margin: -0.875rem -0.5rem;
  padding: 0 0.5rem;
  font-weight: 700;
  font-size: 0.8125rem;
  white-space: nowrap;
  color: ${({ theme }) => theme.colors.info.text};
  text-decoration: none;

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

/** A próxima meta, no imperativo, a partir do primeiro selo que falta. */
export function goalFor(badge: BadgeInfo): string {
  if (badge.kind === 'combo') return `Acerte ${badge.id.replace('combo-', '')} notas seguidas`;
  const goals: Partial<Record<BadgeId, string>> = {
    'primeira-musica': 'Toque uma música até o fim',
    'sem-erros': 'Toque uma música inteira sem errar nenhuma nota',
    'afinacao-de-ouro': `Termine uma música com afinação média de até ${GOLD_TUNING_CENTS} ¢`,
  };
  return goals[badge.id] ?? badge.description;
}

const STRING_LETTERS: StringName[] = ['G', 'D', 'A', 'E'];
const STRING_NAMES = ['Sol', 'Ré', 'Lá', 'Mi'];
const dayLabel = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const cents = (value: number) => `±${Math.round(value)} ¢`;

/** As 4 semanas de uma corda: quanto mais baixo na caixa, maior o desvio (a linha desce quando melhora, como no design). */
function trendPoints(weeks: readonly (number | null)[], max: number): string {
  return weeks
    .map((v, i) => (v === null ? null : `${(i * 160) / 3},${(4 + (1 - Math.min(v, max) / max) * 26).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');
}

/** 11 · Perfil e progresso: quem joga, sequência, minutos, afinação por corda e conquistas. */
export const Profile: React.FC = () => {
  const progress = useProgress();
  const shelf = useShelf();
  const owned = new Set(progress.badges);
  const nextBadge = BADGES.find((b) => !owned.has(b.id));
  const look = progress.animal ? ANIMAL_LOOK[progress.animal] : null;
  const name = progress.nickname ?? 'Violinista';
  const streak = progress.streakDays;
  const history = progress.history;
  const [today] = React.useState(todayInBrazil);
  const week = history ? lastDays(history.days, today, 7) : null;
  // A sequência é a do servidor: o dia de prática soma minutos, mas não acende a bolinha
  const marked = history ? markedDays(history.days, today, 7) : null;
  const fortnight = history ? lastDays(history.days, today, 14) : null;
  const tallest = fortnight ? Math.max(...fortnight) : 0;
  const tuning = history ? tuningAverage(history.plays, today) : null;
  const trend = history ? stringTrend(history.plays, today) : null;
  const trendMax = trend ? Math.max(5, ...trend.flat().filter((v): v is number => v !== null)) : 5;
  const latest = trend?.map((weeks) => [...weeks].reverse().find((v) => v !== null) ?? null);
  const worst = latest && latest.some((v) => v !== null) ? latest.indexOf(Math.max(...latest.filter((v): v is number => v !== null))) : -1;
  const learned = learnedSongs(progress.records);
  const shelfSize = shelf.status === 'ready' ? shelf.songs.length : null;

  return (
    <Page>
      <Header>
        <Avatar $string={look?.string ?? null}>{look ? <span role="img" aria-label={look.name}>{look.emoji}</span> : <span aria-hidden="true">VH</span>}</Avatar>
        <Who>
          <div>
            <h1>{name}</h1>
            {progress.level && <Pill>{LEVEL_INFO[progress.level].title}</Pill>}
          </div>
          <Bar>
            <div role="progressbar" aria-label="Selos conquistados" aria-valuemin={0} aria-valuemax={BADGES.length} aria-valuenow={owned.size}>
              <i style={{ width: `${(owned.size / BADGES.length) * 100}%` }} />
            </div>
            <span>
              {owned.size} / {BADGES.length} selos
            </span>
          </Bar>
        </Who>
        <nav aria-label="Perfil">
          <Button as={Link} to={ROUTES.ranking} $variant="ghost">
            Ranking
          </Button>
          <Button as={Link} to={settingsUrl()} $variant="ghost">
            Configurações
          </Button>
          <BackLink />
        </nav>
      </Header>

      <Stats>
        <Card aria-label="Sequência" $tone={streak ? 'warning' : undefined}>
          <Kicker>Sequência</Kicker>
          <Big $tone={streak ? 'warning' : undefined}>{streak === null ? '—' : `${streak} ${streak === 1 ? 'dia' : 'dias'}`}</Big>
          {marked && (
            <Week aria-label={`Tocou em ${marked.filter(Boolean).length} dos últimos 7 dias`} role="img">
              {marked.map((on, i) => (
                <i key={i} data-off={on || i === 6 ? undefined : ''} data-today={i === 6 && !on ? '' : undefined} />
              ))}
            </Week>
          )}
          <Sub>{streak === null ? 'Conta com internet' : marked?.[6] ? 'Hoje já valeu' : streak ? 'Toque hoje para manter' : 'Toque hoje para começar'}</Sub>
        </Card>
        <Card aria-label="Prática na semana">
          <Kicker>Prática na semana</Kicker>
          <Big>{week ? formatDuration(week.reduce((a, b) => a + b, 0)) : '—'}</Big>
          <Sub>{week ? 'Nos últimos 7 dias' : 'Conta com internet'}</Sub>
        </Card>
        <Card aria-label="Músicas aprendidas">
          <Kicker>Músicas aprendidas</Kicker>
          <Big>
            {learned} {shelfSize !== null && <small>de {shelfSize}</small>}
          </Big>
          <Sub>{LEARNED_ACCURACY}% ou mais no Médio</Sub>
        </Card>
        <Card aria-label="Afinação média">
          <Kicker>Afinação média</Kicker>
          <Big>{tuning?.now != null ? cents(tuning.now) : '—'}</Big>
          <Sub>{tuning?.before != null ? `Era ${cents(tuning.before)} há um mês` : tuning?.now != null ? 'Nesta semana' : 'Toque para medir'}</Sub>
        </Card>
      </Stats>

      <Panels>
        <Card aria-label="Minutos por dia">
          <PanelHead>
            <Kicker>Minutos por dia</Kicker>
            <Sub>últimos 14 dias</Sub>
          </PanelHead>
          {fortnight ? (
            <>
              <Bars role="img" aria-label={`Minutos praticados por dia nos últimos 14 dias; hoje ${Math.round(fortnight[13] / 60)}, maior dia ${Math.round(tallest / 60)} minutos`}>
                {fortnight.map((seconds, i) => (
                  <i key={i} style={{ height: `${tallest ? (seconds / tallest) * 100 : 0}%` }} data-empty={seconds ? undefined : ''} data-today={i === 13 ? '' : undefined} />
                ))}
              </Bars>
              <Axis aria-hidden="true">
                <span>{dayLabel.format(new Date(`${shiftDay(today, 13)}T12:00:00Z`))}</span>
                <span>maior: {Math.round(tallest / 60)} min</span>
                <span>hoje</span>
              </Axis>
            </>
          ) : (
            <Empty>Seus minutos aparecem aqui quando você toca com internet.</Empty>
          )}
          <Next>
            <div>
              <InfoKicker>Próxima meta</InfoKicker>
              <span>{nextBadge ? goalFor(nextBadge) : 'Bata seus próprios recordes'}</span>
            </div>
            <Button as={Link} to={modesUrl()}>
              Tocar
            </Button>
          </Next>
        </Card>

        <Card aria-label="Afinação por corda">
          <PanelHead>
            <Kicker>Afinação por corda</Kicker>
            <Sub>4 semanas</Sub>
          </PanelHead>
          {trend && latest?.some((v) => v !== null) ? (
            <>
              {trend.map((weeks, s) => {
                const known = weeks.filter((v): v is number => v !== null);
                const color = STRING_LETTERS[s];
                return (
                  <StringRow key={color} aria-label={`Corda ${STRING_NAMES[s]}`} role="group">
                    <Letter $string={color} aria-hidden="true">
                      {color}
                    </Letter>
                    <Trend $string={color} viewBox="0 0 160 34" preserveAspectRatio="none" aria-hidden="true">
                      <polyline points={trendPoints(weeks, trendMax)} />
                    </Trend>
                    <b>{known.length ? (known.length > 1 ? `${Math.round(known[0])} → ${Math.round(known.at(-1)!)} ¢` : `${Math.round(known[0])} ¢`) : '—'}</b>
                  </StringRow>
                );
              })}
              <Sub as="p" $wrap data-foot="">
                Linha descendo = desvio menor.{worst >= 0 && ` A corda ${STRING_NAMES[worst]} ainda é a que mais escapa.`}
              </Sub>
            </>
          ) : (
            <Empty>Toque com internet e a afinação de cada corda aparece aqui, semana a semana.</Empty>
          )}
        </Card>

        <Card aria-label="Conquistas">
          <PanelHead>
            <Kicker>Conquistas</Kicker>
            <SeeAll to={ROUTES.badges} aria-label={`Ver todos os selos: ${owned.size} de ${BADGES.length}`}>
              {owned.size} de {BADGES.length} · Ver todos <span aria-hidden="true">▸</span>
            </SeeAll>
          </PanelHead>
          <Achievements>
            {BADGES.map((b) => (
              <li key={b.id} data-locked={owned.has(b.id) ? undefined : ''}>
                <Badge kind={b.kind} label={b.label} size={30} locked={!owned.has(b.id)} />
                {b.label}
              </li>
            ))}
          </Achievements>
        </Card>
      </Panels>
    </Page>
  );
};
