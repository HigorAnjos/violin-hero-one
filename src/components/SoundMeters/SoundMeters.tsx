import React from 'react';
import styled from 'styled-components';
import { Kicker } from '../Screen/Screen';
import { SegmentMeter, type SegmentTone } from '../SegmentMeter/SegmentMeter';
import { noiseView, volumeView, type MeterView } from './meterLevels';

const SEGMENTS = 12;

const Panel = styled.section`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1rem 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.surfaceBorder};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};
    padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;

  > span:first-child {
    flex: none;
    width: 7.5rem;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
  }

  > :nth-child(2) {
    flex: 1;
  }

  @media (max-height: 500px) {
    > span:first-child {
      width: 6.5rem;
      font-size: 0.75rem;
    }
  }
`;

const Word = styled.span<{ $tone: SegmentTone }>`
  flex: none;
  width: 4rem;
  text-align: right;
  font-size: 0.8125rem;
  font-weight: 700;
  color: ${({ theme, $tone }) => ($tone === 'primary' ? theme.colors.text : theme.colors[$tone].text)};
`;

const Meter: React.FC<{ name: string; view: MeterView; tone: SegmentTone }> = ({ name, view, tone }) => {
  const lit = Math.round(view.fraction * SEGMENTS);
  return (
    <Row>
      <span>{name}</span>
      <SegmentMeter fraction={view.fraction} count={SEGMENTS} label={`${name}: ${view.word}, ${lit} de ${SEGMENTS}`} toneAt={() => tone} />
      <Word $tone={view.tone} aria-hidden="true">
        {view.word}
      </Word>
    </Row>
  );
};

/** "Como está o som": volume do violino e ruído do ambiente, cada um com a palavra que resume. */
export const SoundMeters: React.FC<{ volumeDb: number; noiseDb: number }> = ({ volumeDb, noiseDb }) => {
  const noise = noiseView(noiseDb);
  return (
    <Panel aria-labelledby="som-titulo">
      <Kicker id="som-titulo">Como está o som</Kicker>
      <Meter name="Volume" view={volumeView(volumeDb)} tone="primary" />
      <Meter name="Ruído do ambiente" view={noise} tone={noise.tone} />
    </Panel>
  );
};
