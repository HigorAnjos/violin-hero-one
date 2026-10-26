import React from 'react';
import { Link } from 'react-router-dom';
import styled from 'styled-components';
import { ANIMAL_LOOK } from '../components/AvatarPicker/AvatarPicker';
import { Badge } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { Kicker } from '../components/Screen/Screen';
import type { StringName } from '../assets/styles/themes';
import { rgba } from '../assets/styles/themes/color';
import { BADGES } from '../game/engine';
import { findFixedSong } from '../game/notation/songs';
import { useShelf } from '../services/shelf';
import { modesUrl } from '../shell/choice';
import { useProgress } from '../shell/progress';
import { ROUTES } from '../shell/routes';
import { LEVEL_INFO } from './OnboardLevel';
import { settingsUrl } from './Settings';

const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding: 1.75rem 3rem;
  overflow: hidden;

  @media (max-height: 500px) {
    gap: 0.5rem;
    padding: 0.625rem max(1rem, env(safe-area-inset-right)) 0.625rem max(1rem, env(safe-area-inset-left));
  }
`;

const Header = styled.header`
  display: flex;
  align-items: center;
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

const Card = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  min-width: 0;
  padding: 1rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
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

const Sub = styled.span`
  font-size: 0.8125rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Panels = styled.div`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
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

const Records = styled.ol`
  display: flex;
  flex-direction: column;

  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.75rem;
    padding: 0.5rem 0;
    border-bottom: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    font-size: 0.9375rem;
    color: ${({ theme }) => theme.colors.text};
  }

  li span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  li small {
    margin-left: 0.5rem;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  b {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  @media (max-height: 500px) {
    li {
      padding: 0.25rem 0;
      font-size: 0.8125rem;
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

const score = new Intl.NumberFormat('pt-BR');

/** 11 · Perfil e progresso: quem joga, nível, recordes, sequência e conquistas. */
export const Profile: React.FC = () => {
  const progress = useProgress();
  const shelf = useShelf();
  const titleOf = (id: string) => (shelf.status === 'ready' ? shelf.songs.find((s) => s.id === id)?.title : undefined) ?? findFixedSong(id)?.title ?? id;
  const owned = new Set(progress.badges);
  const nextBadge = BADGES.find((b) => !owned.has(b.id));
  const look = progress.animal ? ANIMAL_LOOK[progress.animal] : null;
  const name = progress.nickname ?? 'Violinista';
  const best = progress.records[0];
  const streak = progress.streakDays;

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
          <Button as={Link} to={ROUTES.home} $variant="ghost">
            <span aria-hidden="true">◂</span>
            Menu
          </Button>
          <Button as={Link} to={settingsUrl()} $variant="ghost">
            Configurações
          </Button>
        </nav>
      </Header>

      <Stats>
        <Card aria-label="Sequência">
          <Kicker>Sequência</Kicker>
          <Big $tone={streak ? 'warning' : undefined}>{streak === null ? '—' : `${streak} ${streak === 1 ? 'dia' : 'dias'}`}</Big>
          <Sub>{streak === null ? 'Conta com internet' : streak ? 'Toque hoje para manter' : 'Toque hoje para começar'}</Sub>
        </Card>
        <Card aria-label="Recordes">
          <Kicker>Recordes</Kicker>
          <Big>{progress.records.length}</Big>
          <Sub>{progress.records.length === 1 ? 'música e nível' : 'músicas e níveis'}</Sub>
        </Card>
        <Card aria-label="Melhor pontuação">
          <Kicker>Melhor pontuação</Kicker>
          <Big>{best ? score.format(best.score) : '—'}</Big>
          <Sub>{best ? `${titleOf(best.songId)} · ${LEVEL_NAMES[best.level]}` : 'Termine uma música'}</Sub>
        </Card>
        <Card aria-label="Selos">
          <Kicker>Selos</Kicker>
          <Big>
            {owned.size} <small>de {BADGES.length}</small>
          </Big>
          <Sub>{nextBadge ? `Próximo: ${nextBadge.label}` : 'Todos conquistados'}</Sub>
        </Card>
      </Stats>

      <Panels>
        <Card aria-label="Seus recordes">
          <PanelHead>
            <Kicker>Seus recordes</Kicker>
            <Sub>maiores primeiro</Sub>
          </PanelHead>
          {progress.records.length ? (
            <Records>
              {progress.records.slice(0, 6).map((r) => (
                <li key={`${r.songId}:${r.level}`}>
                  <span>
                    {titleOf(r.songId)}
                    <small>{LEVEL_NAMES[r.level]}</small>
                  </span>
                  <b>{score.format(r.score)}</b>
                </li>
              ))}
            </Records>
          ) : (
            <Empty>Termine uma música a 100% da velocidade para ter seu primeiro recorde.</Empty>
          )}
          <Next>
            <div>
              <Kicker>Próxima meta</Kicker>
              <span>{nextBadge ? nextBadge.description : 'Bater seus próprios recordes'}</span>
            </div>
            <Button as={Link} to={modesUrl()}>
              Tocar
            </Button>
          </Next>
        </Card>

        <Card aria-label="Conquistas">
          <PanelHead>
            <Kicker>Conquistas</Kicker>
            <Sub>
              {owned.size} de {BADGES.length}
            </Sub>
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
