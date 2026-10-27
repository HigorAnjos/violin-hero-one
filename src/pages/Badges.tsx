import React from 'react';
import { Link } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Badge, badgeColor } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import { Kicker } from '../components/Screen/Screen';
import { BADGES, type Badge as BadgeInfo } from '../game/engine';
import { GOLD_TUNING_CENTS } from '../game/engine/badges';
import { modesUrl } from '../shell/choice';
import { useBadgeCollection, type CollectedBadge, type Collection } from '../shell/progress';
import { ROUTES } from '../shell/routes';
import { goalFor } from './Profile';

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

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    width: min(26.25rem, 45vw);
    min-width: 0;
  }

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2rem;
    line-height: 1;
    color: ${({ theme }) => theme.colors.text};
  }

  > nav {
    margin-left: auto;
    display: flex;
    gap: 0.75rem;
  }

  @media (max-height: 500px) {
    gap: 0.75rem;

    > div {
      gap: 0.125rem;
    }

    h1 {
      font-size: 1.25rem;
    }

    > nav {
      gap: 0.5rem;
    }

    > nav > * {
      padding: 0 0.75rem;
    }
  }
`;

const Progress = styled.div`
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

const Lead = styled.p`
  margin-top: -0.5rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    display: none;
  }
`;

/** As células de "Seus selos" (Ranking.dc): cheias quando ganhas, tracejadas e apagadas quando faltam. */
const Grid = styled.ul`
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 1rem;

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
`;

const Cell = styled.li`
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
  min-height: 0;
  padding: 1rem 1.125rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  box-shadow: ${({ theme }) => theme.shadows.card};

  &[data-locked] {
    background-color: transparent;
    border-style: dashed;
    box-shadow: none;
  }

  > svg {
    flex: none;
    width: 4rem;
    height: auto;
  }

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.25rem;
    line-height: 1.5rem;
    color: ${({ theme }) => theme.colors.text};
  }

  &[data-locked] b {
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: 0.625rem;
    padding: 0.5rem 0.75rem;

    > svg {
      width: 2.5rem;
    }

    > div {
      gap: 0.125rem;
    }

    b {
      font-size: 0.9375rem;
      line-height: 1.25rem;
    }
  }
`;

const Detail = styled.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};
  overflow-wrap: anywhere;

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

const Bar = styled.span<{ $color: string }>`
  display: block;
  width: 100%;
  max-width: 13rem;
  height: 0.5rem;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: ${({ $color }) => $color};
  }
`;

const Note = styled.p`
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });

/** "Ganho em 20/10/2026 · Minueto (Fácil)", ou "Ganho neste aparelho" quando o servidor ainda não sabe dele. */
export function earnedText(badge: CollectedBadge): string {
  if (badge.source === 'device') return 'Ganho neste aparelho';
  const { earnedAt, play } = badge.earned;
  const when = `Ganho em ${dateLabel.format(new Date(earnedAt))}`;
  if (!play) return when;
  return `${when} · ${play.songTitle ?? 'música removida'} (${LEVEL_NAMES[play.level]})`;
}

/** O que falta para um selo: a meta e, quando o servidor sabe, quanto já foi (0 a 1). */
export function missingFor(badge: BadgeInfo, collection: Pick<Collection, 'bestCombo' | 'bestCents'>): { text: string; progress: number | null } {
  if (badge.kind === 'combo') {
    const target = Number(badge.id.replace('combo-', ''));
    const best = collection.bestCombo;
    if (best === null) return { text: goalFor(badge), progress: null };
    return { text: `Melhor combo: ${best} · faltam ${Math.max(0, target - best)} notas`, progress: Math.min(1, best / target) };
  }
  if (badge.id === 'afinacao-de-ouro' && collection.bestCents !== null) {
    const best = collection.bestCents;
    return {
      text: `Melhor afinação: ±${best.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ¢ · meta ${GOLD_TUNING_CENTS} ¢`,
      progress: Math.min(1, GOLD_TUNING_CENTS / Math.max(best, GOLD_TUNING_CENTS)),
    };
  }
  return { text: goalFor(badge), progress: null };
}

/** Coleção de selos: os ganhos com data e partida, os que faltam com o que falta e o progresso total. */
export const Badges: React.FC = () => {
  const theme = useTheme();
  const collection = useBadgeCollection();
  const owned = new Map(collection.earned.map((e) => [e.id, e]));

  return (
    <Page>
      <Header>
        <div>
          <Kicker>Coleção</Kicker>
          <h1>Seus selos</h1>
          <Progress>
            <div role="progressbar" aria-label="Selos conquistados" aria-valuemin={0} aria-valuemax={BADGES.length} aria-valuenow={owned.size}>
              <i style={{ width: `${(owned.size / BADGES.length) * 100}%` }} />
            </div>
            <span>
              {owned.size} de {BADGES.length}
            </span>
          </Progress>
        </div>
        <nav aria-label="Selos">
          <Button as={Link} to={ROUTES.profile} $variant="ghost">
            <span aria-hidden="true">◂</span>
            Perfil
          </Button>
          <Button as={Link} to={modesUrl()}>
            Tocar
          </Button>
        </nav>
      </Header>
      <Lead>Todo selo é ganho tocando: aparece no fim da partida em que você conseguiu. Prática não vale selo.</Lead>

      <Grid aria-label="Selos">
        {BADGES.map((b) => {
          const earned = owned.get(b.id);
          const missing = earned ? null : missingFor(b, collection);
          const color = badgeColor(theme, b.kind);
          return (
            <Cell key={b.id} data-locked={earned ? undefined : ''}>
              <Badge kind={b.kind} label={b.label} size={64} locked={!earned} />
              <div>
                <b>{b.label}</b>
                <Detail>{earned ? earnedText(earned) : missing!.text}</Detail>
                {missing?.progress != null && (
                  <Bar $color={color} role="progressbar" aria-label={`Progresso até ${b.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(missing.progress * 100)}>
                    <i style={{ width: `${missing.progress * 100}%` }} />
                  </Bar>
                )}
              </div>
            </Cell>
          );
        })}
      </Grid>
      {collection.status === 'device' && <Note role="status">Sem conexão com o servidor: estes são os selos deste aparelho.</Note>}
    </Page>
  );
};
