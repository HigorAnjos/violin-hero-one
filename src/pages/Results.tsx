import React from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import styled, { useTheme } from 'styled-components';
import { Badge, badgeColor } from '../components/Badge/Badge';
import { Button } from '../components/Button/Button';
import { LEVEL_NAMES } from '../components/CountIn/countIn';
import {
  centsText,
  featuredBadges,
  hardestStretch,
  hits,
  HARD_BELOW,
  measureAccuracy,
  measuresLabel,
  stars,
  stringReport,
  tuningAdvice,
  tuningStat,
} from '../components/ResultSummary/summary';
import { formatPercent, formatPoints } from '../components/ScoreCard/ScoreCard';
import { clampLines, Kicker, Screen, ScreenTitle } from '../components/Screen/Screen';
import { JUDGMENT_LABEL, JUDGMENTS } from '../game/engine';
import { STRING_LETTERS } from '../game/notation/violin';
import type { PracticeStart } from '../shell/gameSession';
import { gameRoute, readResultState } from '../shell/play';
import type { RecordCheck } from '../shell/records';
import { ROUTES } from '../shell/routes';

const STAR = 'M17 2l4.5 9.4 10.3 1.2-7.6 7 2.1 10.2L17 24.7l-9.3 5.1 2.1-10.2-7.6-7 10.3-1.2z';
/** Régua da afinação por corda: ±20 ¢. */
const CENTS_RANGE = 20;

const Header = styled.header`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.lg};

  > div:first-child {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.xs};
  }

  > div:first-child ${Kicker} {
    ${clampLines(1)}
  }

  h1 {
    ${clampLines(2)}
  }

  @media (max-height: 500px) {
    align-items: center;

    > div:first-child ${Kicker} {
      display: none;
    }

    h1 {
      ${clampLines(1)}
      font-size: 1.25rem;
    }

    [role='status'] {
      padding-top: 0.125rem;
      padding-bottom: 0.125rem;
    }
  }
`;

const NewBadge = styled.div<{ $color: string }>`
  flex: none;
  display: flex;
  white-space: nowrap;
  align-items: center;
  gap: 0.625rem;
  padding: 0.375rem 1rem 0.375rem 0.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  box-shadow: 0 3px 0 ${({ $color }) => $color};

  span {
    display: flex;
    flex-direction: column;
    line-height: 1.15;
  }

  small {
    font-weight: 800;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    color: ${({ $color }) => $color};
  }

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.0625rem;
  }
`;

const Body = styled.div`
  flex-grow: 1;
  min-height: 0;
  display: flex;
  gap: ${({ theme }) => theme.spacing.lg};

  > div {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.md};
  }

  > div:first-child {
    width: 33.75rem;
    flex: none;
  }

  > div:last-child {
    flex: 1 1 0;
    min-width: 0;
  }

  @media (max-width: 1100px), (max-height: 500px) {
    > div:first-child {
      width: 50%;
      flex: 1 1 0;
    }

    gap: ${({ theme }) => theme.spacing.sm};

    > div {
      gap: ${({ theme }) => theme.spacing.sm};
    }
  }
`;

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.125rem 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  }
`;

const PanelHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Grow = styled(Panel)`
  flex-grow: 1;
`;

const Score = styled.span`
  ${clampLines(1)}
  font-weight: 800;
  font-size: 3.75rem;
  line-height: 1;

  @media (max-height: 500px) {
    font-size: 2rem;
  }
`;

const ScoreRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

const RecordPill = styled.span`
  flex: none;
  padding: 0.25rem 0.75rem;
  border: 2px solid ${({ theme }) => theme.colors.warning.main};
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 800;
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.colors.warning.text};

  @media (max-height: 500px) {
    padding: 0.125rem 0.5rem;
    font-size: 0.75rem;
  }
`;

const Muted = styled.span`
  font-size: 0.875rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

const Text = styled.p`
  font-size: 0.875rem;
  line-height: 1.25rem;

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;
  }
`;

/** Detalhe que some no celular deitado, onde a tela não rola. */
const Detail = styled(Text)`
  @media (max-height: 500px) {
    display: none;
  }
`;

const Stats = styled.dl`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;

  > div {
    min-width: 0;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.375rem;
    padding: 0.75rem 0.875rem;
    background-color: ${({ theme }) => theme.colors.surface};
    border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: ${({ theme }) => theme.borderRadius.sm};
  }

  dt,
  dd {
    ${clampLines(1)}
  }

  dd {
    font-weight: 800;
    font-size: 1.5rem;
    line-height: 1;
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};

    > div {
      padding: ${({ theme }) => theme.spacing.xxs} 0.375rem;
    }

    /* 12 px é o piso: o "Combo máx" cabe tirando o espaçamento das letras e parte do recuo da célula */
    dt {
      font-size: 0.75rem;
      letter-spacing: 0;
    }

    dd {
      font-size: 1rem;
    }
  }
`;

const Row = styled.div`
  display: grid;
  grid-template-columns: 6.875rem 1fr 3.5rem;
  gap: 0.875rem;
  align-items: center;

  > span:first-child,
  > b {
    ${clampLines(1)}
  }

  > span:first-child {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.125rem;
  }

  > b {
    font-weight: 400;
    font-size: 1.125rem;
    text-align: right;
  }

  @media (max-height: 500px) {
    grid-template-columns: 4.5rem 1fr 2.5rem;

    > span:first-child,
    > b {
      font-size: 0.8125rem;
      line-height: 1.1;
    }
  }
`;

const Track = styled.div`
  position: relative;
  height: 0.5rem;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
  }
`;

const StringRow = styled(Row)`
  grid-template-columns: 1.75rem 1fr 4rem;

  > span:first-child {
    font-weight: 500;
    font-size: 1.375rem;
  }

  > b {
    font-size: 1rem;
  }

  @media (max-height: 500px) {
    grid-template-columns: 1.25rem 1fr 2.5rem;

    > span:first-child {
      font-size: 1rem;
      line-height: 1.1;
    }

    > b {
      font-size: 0.8125rem;
    }
  }
`;

const Stars = styled.svg`
  @media (max-height: 500px) {
    width: 6.25rem;
    height: auto;
  }
`;

const Deviation = styled.div`
  position: relative;
  height: 0.875rem;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};

  &::after {
    content: '';
    position: absolute;
    left: 50%;
    top: -4px;
    bottom: -4px;
    width: 1px;
    background-color: ${({ theme }) => theme.colors.text};
    opacity: 0.6;
  }

  i {
    position: absolute;
    top: 2px;
    bottom: 2px;
  }
`;

const Timeline = styled.div`
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 1.625rem;

  i {
    flex: 1;
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  i[data-low] {
    background-color: ${({ theme }) => theme.colors.warning.main};
  }
`;

const Footer = styled.footer`
  display: flex;
  align-items: center;
  gap: 0.75rem;

  > i {
    flex: 1;
  }
`;

/** Velocidade com que "Praticar compassos" abre o trecho mais difícil. */
export const HARDEST_PRACTICE_SPEED = 0.7;

/** O trecho mais difícil vira a prática: laço de A a B, a 70%. */
export function practiceHardest(hard: { from: number; to: number }): PracticeStart {
  return { loop: { startMeasure: hard.from, endMeasure: hard.to }, speed: HARDEST_PRACTICE_SPEED };
}

/** "Novo recorde!" na primeira vez; "+1.250 sobre o recorde" quando passa o anterior. */
export function recordText(record: RecordCheck, score: number): string {
  return record.previous === null ? 'Novo recorde!' : `+${formatPoints(score - record.previous)} sobre o recorde`;
}

/** 7 · Resultado: pontos, julgamentos, afinação por corda e o trecho mais difícil. */
export const Results: React.FC = () => {
  const theme = useTheme();
  const state = readResultState(useLocation().state);
  if (!state) return <Navigate to={ROUTES.home} replace />;
  const { song, result, mode, record } = state;
  const practiced = 'laps' in result;
  const total = result.judgments.length;
  const starCount = stars(result.accuracy);
  const perMeasure = measureAccuracy(result);
  const hard = hardestStretch(perMeasure);
  const firstBadge = featuredBadges(result.badges).featured;
  const judgmentColor = (j: (typeof JUDGMENTS)[number]) => theme.game.judgments[j];

  return (
    <Screen $gap="1.375rem" data-testid="resultado">
      <Header>
        <div>
          <Kicker>
            Resultado · {mode} · {LEVEL_NAMES[song.level]}
          </Kicker>
          <ScreenTitle>{song.title}</ScreenTitle>
        </div>
        {firstBadge && (
          <NewBadge role="status" aria-label={`Selo conquistado nesta partida: ${firstBadge.label}`} $color={badgeColor(theme, firstBadge.kind)}>
            <Badge kind={firstBadge.kind} label={firstBadge.label} size={34} decorative />
            <span>
              <small>SELO NOVO!</small>
              <b>{firstBadge.label}</b>
            </span>
          </NewBadge>
        )}
      </Header>

      <Body>
        <div>
          <Panel aria-label="Pontuação">
            <Stars width="190" height="34" viewBox="0 0 190 34" role="img" aria-label={`${starCount} de 5 estrelas`}>
              {[0, 1, 2, 3, 4].map((i) => (
                <path key={i} transform={`translate(${i * 38} 0)`} d={STAR} fill={i < starCount ? theme.colors.warning.main : theme.colors.surfaceBorder} />
              ))}
            </Stars>
            <ScoreRow>
              <Score>{formatPoints(result.score)}</Score>
              {record?.improved && <RecordPill role="status">{recordText(record, result.score)}</RecordPill>}
            </ScoreRow>
            {practiced ? (
              <Muted>Partida de prática: sem selos e sem recorde.</Muted>
            ) : (
              record && !record.improved && record.previous !== null && <Muted>Recorde: {formatPoints(record.previous)}</Muted>
            )}
            {state.noFail && !practiced && <Muted>Modo sem falha: a música não parou.</Muted>}
          </Panel>
          <Stats>
            <div>
              <dd>{formatPercent(result.accuracy)}</dd>
              <Kicker as="dt">Precisão</Kicker>
            </div>
            <div>
              <dd>{result.maxCombo}</dd>
              <Kicker as="dt">Combo máx</Kicker>
            </div>
            <div>
              <dd>{tuningStat(result)}</dd>
              <Kicker as="dt">Afinação</Kicker>
            </div>
            <div>
              <dd>{`${hits(result)}/${total}`}</dd>
              <Kicker as="dt">Notas</Kicker>
            </div>
          </Stats>
          <Grow aria-label="Julgamentos">
            {JUDGMENTS.map((j) => (
              <Row key={j}>
                <span style={{ color: judgmentColor(j) }}>{JUDGMENT_LABEL[j]}</span>
                <Track>
                  <i style={{ width: `${total ? (result.counts[j] / total) * 100 : 0}%`, background: judgmentColor(j) }} />
                </Track>
                <b>{result.counts[j]}</b>
              </Row>
            ))}
          </Grow>
        </div>

        <div>
          <Panel aria-label="Afinação por corda">
            <PanelHead>
              <Kicker>Afinação média por corda</Kicker>
              <Muted aria-hidden="true">−20 ¢ · 0 · +20 ¢</Muted>
            </PanelHead>
            {result.strings.map((s) => {
              const letter = STRING_LETTERS[s.string];
              const c = Math.max(-CENTS_RANGE, Math.min(CENTS_RANGE, s.meanCents ?? 0));
              const width = (Math.abs(c) / CENTS_RANGE) * 50;
              return (
                <StringRow key={s.string}>
                  <span style={{ color: theme.game.strings[letter].main }}>{letter}</span>
                  <Deviation role="img" aria-label={`Corda ${letter}: ${s.meanCents === null ? 'sem acertos' : centsText(s.meanCents)}`}>
                    {s.meanCents !== null && <i style={{ left: `${c < 0 ? 50 - width : 50}%`, width: `${width}%`, background: theme.game.strings[letter].main }} />}
                  </Deviation>
                  <b>{centsText(s.meanCents)}</b>
                </StringRow>
              );
            })}
            <Text>{tuningAdvice(result)}</Text>
          </Panel>

          <Grow aria-label="Trecho mais difícil">
            <Kicker>{hard ? `Trecho mais difícil · ${measuresLabel(hard.from, hard.to)}` : 'Nenhum trecho abaixo de 90%'}</Kicker>
            <Timeline role="img" aria-label={hard ? `Precisão por compasso; queda ${measuresLabel(hard.from, hard.to)}` : 'Precisão por compasso: tudo acima de 90%'}>
              {perMeasure.map((a, i) => (
                <i key={i} style={{ height: `${a ?? 0}%` }} data-low={a !== null && a < HARD_BELOW ? '' : undefined} />
              ))}
            </Timeline>
            <Muted>
              {hard ? `${measuresLabel(hard.from, hard.to)} · ${formatPercent(hard.accuracy)}` : `${result.totalMeasures} compassos`}
            </Muted>
            {result.mostMissedString !== null && <Detail>{stringReport(result, result.mostMissedString)}</Detail>}
          </Grow>
        </div>
      </Body>

      <Footer>
        <Button as={Link} to={ROUTES.home} $variant="ghost">
          Menu
        </Button>
        <i />
        <Button as={Link} to={ROUTES.calibration} state={{ song, mode, practice: state.practice }} $variant="ghost">
          Afinar de novo
        </Button>
        {hard && (
          <Button
            as={Link}
            to={ROUTES.countdown}
            state={{ song, mode: 'Prática', latencyMs: state.latencyMs, practice: practiceHardest(hard), next: gameRoute('Prática') }}
            replace
            $variant="ghost"
          >
            Praticar compassos
          </Button>
        )}
        <Button as={Link} to={ROUTES.countdown} state={{ song, mode, latencyMs: state.latencyMs, practice: state.practice, next: gameRoute(mode) }} replace>
          Tocar de novo <span aria-hidden="true">▸</span>
        </Button>
      </Footer>
    </Screen>
  );
};
