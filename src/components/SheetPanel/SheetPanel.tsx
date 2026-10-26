import React from 'react';
import styled from 'styled-components';
import { clock } from '../../game/render/staff';
import { clampLines, Kicker } from '../Screen/Screen';

const Panel = styled.section<{ $accent?: string }>`
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background-color: ${({ theme }) => theme.game.track};
  border: 1px solid ${({ theme, $accent }) => $accent ?? theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  overflow: hidden;
`;

const Head = styled.div`
  flex: none;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 0.75rem 1rem 0;
  min-height: 2.25rem;

  > ${Kicker} {
    ${clampLines(1)}
    flex: 1 1 auto;
  }

  > span:not(${Kicker}) {
    flex: none;
    font-size: 0.9375rem;
    font-variant-numeric: tabular-nums;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: 0.375rem 0.75rem 0;
    min-height: 1.5rem;

    > span:not(${Kicker}) {
      font-size: 0.75rem;
    }
  }
`;

const Bar = styled.div`
  flex: 0 1 22.5rem;
  min-width: 4rem;
  height: 0.5rem;
  border-radius: 4px;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: ${({ theme }) => theme.colors.info.main};
  }

  @media (max-height: 500px) {
    flex-basis: 6rem;
  }
`;

const Host = styled.div`
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  canvas {
    display: block;
  }
`;

export interface SheetPanelProps {
  /** "Partitura · Ré maior · 4/4 · compasso 18 de 64". */
  caption: string;
  elapsed: number;
  total: number;
  /** Onde a faixa (canvas) é montada. */
  host: React.Ref<HTMLDivElement>;
  /** Borda de destaque (laço da prática). */
  accent?: string;
  label?: string;
  /** Por cima da faixa: julgamento, aviso da prática. */
  children?: React.ReactNode;
}

/** A moldura da faixa de partitura (5b, 10): legenda, tempo e progresso em cima, o canvas embaixo. */
export const SheetPanel: React.FC<SheetPanelProps> = ({ caption, elapsed, total, host, accent, label = 'Partitura', children }) => {
  const shown = Math.max(0, Math.min(elapsed, total));
  const percent = total ? Math.round((shown / total) * 100) : 0;
  return (
    <Panel aria-label={label} $accent={accent}>
      <Head>
        <Kicker>{caption}</Kicker>
        <span>{clock(shown)}</span>
        <Bar role="progressbar" aria-label="Andamento da música" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <i style={{ width: `${percent}%` }} />
        </Bar>
        <span>{clock(total)}</span>
      </Head>
      <Host ref={host} data-testid="partitura" aria-hidden="true" />
      {children}
    </Panel>
  );
};
