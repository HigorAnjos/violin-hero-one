import React from 'react';
import styled from 'styled-components';
import { latencyToMs } from '../../game/audio';
import { Button } from '../Button/Button';
import { useRadioGroup } from '../RadioGroup/useRadioGroup';
import { Kicker } from '../Screen/Screen';
import type { CalibrationPhase } from './useLatencyCalibration';

const Panel = styled.section`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Pill = styled.span`
  padding: 0.25rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  background-color: ${({ theme }) => theme.colors.info.main};
  color: ${({ theme }) => theme.colors.background};
  font-weight: 700;
  font-size: 0.6875rem;
  letter-spacing: 0.14em;
`;

const Question = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  font-size: 0.875rem;

  [role='radiogroup'] {
    display: flex;
    gap: ${({ theme }) => theme.spacing.xxs};
  }
`;

const Choice = styled.button<{ $on: boolean }>`
  min-width: 3.5rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  border: 1px solid ${({ theme, $on }) => ($on ? theme.colors.info.main : theme.colors.surfaceBorder)};
  background-color: ${({ theme, $on }) => ($on ? theme.colors.info.main : 'transparent')};
  color: ${({ theme, $on }) => ($on ? theme.colors.background : theme.colors.textMuted)};
  font-weight: 700;
  font-size: 0.8125rem;
`;

const Value = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};

  > div {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
  }

  small {
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  > strong {
    font-weight: 400;
    font-size: 2.125rem;
    line-height: 1;
    white-space: nowrap;
  }
`;

const Text = styled.p<{ $tone?: 'warning' | 'info' | 'danger' }>`
  font-size: 0.8125rem;
  line-height: 1.1875rem;
  color: ${({ theme, $tone }) => ($tone ? theme.colors[$tone].text : theme.colors.textMuted)};

  @media (max-height: 500px) {
    font-size: 0.75rem;
    line-height: 1rem;

    &[data-extra] {
      display: none;
    }
  }
`;

const Actions = styled.div`
  display: flex;
  gap: 0.625rem;
  margin-top: auto;

  > :last-child {
    flex: 1;
  }
`;

/** O que a medida está fazendo, em uma frase. */
export function phaseText(phase: CalibrationPhase): { text: string; tone?: 'warning' | 'info' | 'danger' } | null {
  switch (phase.kind) {
    case 'idle':
      return null;
    case 'counting':
      return { text: `Prepare o arco na corda Lá solta… ${phase.count || ''}`.trim(), tone: 'info' };
    case 'measuring':
      return { text: `Toque a corda Lá solta junto com cada clique · ${phase.beat} de ${phase.total}`, tone: 'info' };
    case 'failed':
      return { text: 'Não deu para começar a medida. Tente de novo.', tone: 'danger' };
    case 'done': {
      const r = phase.result;
      if (r.reliable && r.latencySeconds !== null) return { text: `Medida pronta: ${latencyToMs(r.latencySeconds)} ms, guardada neste aparelho.`, tone: 'info' };
      const hits = r.samples.filter((s) => s.status === 'hit').length;
      return { text: `Não deu para medir (${hits} de ${r.samples.length} tempos). Toque a corda Lá solta junto com o clique e meça de novo.`, tone: 'warning' };
    }
  }
}

export interface LatencyPanelProps {
  phase: CalibrationPhase;
  seconds: number;
  measured: boolean;
  headphones: boolean;
  onHeadphones: (on: boolean) => void;
  onMeasure: () => void;
  onStart: () => void;
  canMeasure: boolean;
}

const YES_NO = ['sim', 'nao'] as const;

/** Latência do aparelho (tela 4): fone, valor medido, a medida automática e o "Começar". */
export const LatencyPanel: React.FC<LatencyPanelProps> = ({ phase, seconds, measured, headphones, onHeadphones, onMeasure, onStart, canMeasure }) => {
  const radio = useRadioGroup(YES_NO, headphones ? 'sim' : 'nao', (v) => onHeadphones(v === 'sim'));
  const running = phase.kind === 'counting' || phase.kind === 'measuring';
  const status = phaseText(phase);
  return (
    <Panel aria-label="Latência">
      <Head>
        <Kicker>Latência do aparelho</Kicker>
        <Pill>{measured ? 'AUTOMÁTICA' : 'PADRÃO'}</Pill>
      </Head>
      <Question>
        <span id="fone-pergunta">Está de fone?</span>
        <div role="radiogroup" aria-labelledby="fone-pergunta">
          <Choice type="button" $on={headphones} {...radio('sim')}>
            Sim
          </Choice>
          <Choice type="button" $on={!headphones} {...radio('nao')}>
            Não
          </Choice>
        </div>
      </Question>
      {!headphones && <Text $tone="warning">Melhor com fone. Sem fone, afaste o aparelho do violino e baixe o volume: alto e encostado, ele atrapalha o jogo a te ouvir.</Text>}
      <Value>
        <div>
          <span>Este aparelho · {headphones ? 'fone' : 'alto-falante'}</span>
          <small>{measured ? 'medida guardada aqui' : 'ainda não medida'}</small>
        </div>
        <strong>{latencyToMs(seconds)} ms</strong>
      </Value>
      <Text data-extra>O jogo toca um clique e mede quanto o microfone demora para ouvir. Esse tempo é descontado de cada nota.</Text>
      {!measured && !running && <Text $tone="warning">Este microfone com esta saída de som ainda não foi medido. Meça antes de tocar.</Text>}
      <Text $tone="warning" data-extra>
        ▲ Fone Bluetooth soma 150 a 250 ms. Prefira fone com fio.
      </Text>
      {status && (
        <Text role="status" $tone={status.tone}>
          {status.text}
        </Text>
      )}
      <Actions>
        <Button type="button" $variant="ghost" onClick={onMeasure} disabled={running || !canMeasure}>
          {measured || phase.kind === 'done' ? 'Medir de novo' : 'Medir'}
        </Button>
        <Button type="button" onClick={onStart} disabled={running}>
          Começar <span aria-hidden="true">▸</span>
        </Button>
      </Actions>
    </Panel>
  );
};
