import React from 'react';
import styled, { css, keyframes, useTheme, type DefaultTheme } from 'styled-components';
import type { MicTrouble } from '../../game/audio';
import type { MicProblem } from '../../shell/Ear';
import { SegmentMeter, type SegmentTone } from '../SegmentMeter/SegmentMeter';

type Tone = 'primary' | 'warning' | 'danger';

interface TroubleCopy {
  kicker: string;
  title: string;
  tone: Tone;
  slash: boolean;
  /** Nível mostrado enquanto o Ouvido não manda medida (fração de 0 a 1). */
  restingLevel: number;
  restingLabel: string;
  cta: string;
  waiting: string;
  tips: [string, string][];
}

export const TROUBLE_COPY: Record<MicProblem, TroubleCopy> = {
  'no-sound': {
    kicker: 'Música pausada',
    title: 'Não estou te ouvindo',
    tone: 'primary',
    slash: false,
    restingLevel: 1 / 30,
    restingLabel: 'quase nada',
    cta: 'Continuar',
    waiting: 'Toque a corda Lá solta e eu continuo sozinho.',
    tips: [
      ['📏', 'Deixe o aparelho a um braço de distância, de frente para o violino.'],
      ['🎧', 'Fone Bluetooth atrapalha o microfone. Tire ou use com fio.'],
      ['📱', 'Feche outros apps que usam o microfone (chamada, gravador).'],
    ],
  },
  noisy: {
    kicker: 'Ambiente barulhento',
    title: 'Tem muito barulho por aí',
    tone: 'warning',
    slash: false,
    restingLevel: 27 / 30,
    restingLabel: 'alto o tempo todo',
    cta: 'Continuar mesmo assim',
    waiting: 'Até melhorar, eu fico mais tolerante e não conto erro de afinação.',
    tips: [
      ['🔇', 'TV, ventilador ou conversa perto confundem as notas.'],
      ['🔉', 'Abaixe a música do jogo em Configurações › Som.'],
      ['🚪', 'Um cômodo menor e com a porta fechada ajuda muito.'],
    ],
  },
  blocked: {
    kicker: 'Sem acesso ao microfone',
    title: 'O microfone foi bloqueado',
    tone: 'danger',
    slash: true,
    restingLevel: 0,
    restingLabel: 'sem sinal',
    cta: 'Tentar de novo',
    waiting: 'Sem o microfone não dá para saber o que você tocou.',
    tips: [
      ['🔒', 'No navegador: toque no cadeado ao lado do endereço › Microfone › Permitir.'],
      ['⚙️', 'No celular: Ajustes › Violin Hero › Microfone.'],
      ['🙈', 'Nada é gravado sem você pedir. O som só é analisado na hora.'],
    ],
  },
};

/** Motivo exato do navegador, dito no lugar da espera padrão; vazio quando a espera já explica. */
export const CAUSE_TEXT: Record<MicTrouble, string | undefined> = {
  denied: undefined,
  insecure: 'O microfone só funciona em endereço seguro. Abra o jogo pelo https://.',
  unsupported: 'Este navegador não dá acesso ao microfone. Use o Chrome, o Edge ou o Safari atualizados.',
  'audio-blocked': 'O navegador segurou o som até você tocar na tela. Toque em "Tentar de novo".',
  'no-device': 'Não achei nenhum microfone neste aparelho. Conecte um e toque em Continuar.',
  'in-use': 'O microfone está em uso por outro app. Feche a chamada ou o gravador e toque em Continuar.',
  unknown: undefined,
};

const BARS = 30;

/** Palavra do medidor ao vivo: o que o jogador entende sem olhar as barras. */
export function liveLevelLabel(fraction: number): string {
  if (!(fraction > 0)) return 'sem sinal';
  if (fraction < 0.15) return 'quase nada';
  if (fraction < 0.85) return 'bom';
  return 'alto';
}

/** Barras de 1 a 19 em ciano, 20 a 25 em amarelo, o resto em vermelho (como no design). */
const barTone = (i: number): SegmentTone => (i > 24 ? 'danger' : i > 18 ? 'warning' : 'info');

const toneColors = (theme: DefaultTheme, tone: Tone) =>
  tone === 'primary' ? { main: theme.colors.primary.main, surface: theme.colors.primary.surface, text: theme.colors.primary.main } : theme.colors[tone];

const pulse = keyframes`
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
`;

const Card = styled.section<{ $tone: Tone }>`
  width: min(40rem, 100%);
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  padding: 1.75rem 2rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2.5px solid ${({ theme, $tone }) => toneColors(theme, $tone).main};
  border-radius: 1.375rem;
  box-shadow: 0 6px 0 ${({ theme, $tone }) => toneColors(theme, $tone).main};

  @media (max-height: 500px) {
    width: min(48rem, 100%);
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.lg}`};
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 1.125rem;

  > div {
    display: flex;
    flex-direction: column;
    gap: ${({ theme }) => theme.spacing.xxs};
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.sm};
  }
`;

const Icon = styled.span<{ $tone: Tone }>`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 4.5rem;
  height: 4.5rem;
  border-radius: 1.25rem;
  background-color: ${({ theme, $tone }) => toneColors(theme, $tone).surface};

  @media (max-height: 500px) {
    width: 3rem;
    height: 3rem;
    border-radius: ${({ theme }) => theme.borderRadius.sm};

    svg {
      width: 1.75rem;
      height: 1.75rem;
    }
  }
`;

const Kicker = styled.span<{ $tone: Tone }>`
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: ${({ theme, $tone }) => toneColors(theme, $tone).text};
`;

const Title = styled.h1`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 2rem;
  line-height: 1.05;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    font-size: 1.5rem;
  }
`;

const MeterBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;

  > div:first-child {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Tips = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    font-size: 0.9375rem;
    line-height: 1.3125rem;
    color: ${({ theme }) => theme.colors.text};
  }

  li > span:first-child {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.875rem;
    height: 1.875rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.surfaceHover};
    font-size: 0.9375rem;
  }

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xxs};

    li {
      align-items: center;
      font-size: 0.8125rem;
      line-height: 1.125rem;
    }

    li > span:first-child {
      width: 1.5rem;
      height: 1.5rem;
      font-size: 0.75rem;
    }
  }
`;

const Waiting = styled.div<{ $tone: Tone }>`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.625rem 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  background-color: ${({ theme }) => theme.colors.background};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};

  > i {
    flex: none;
    width: 0.625rem;
    height: 0.625rem;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme, $tone }) => toneColors(theme, $tone).main};

    @media (prefers-reduced-motion: no-preference) {
      ${css`
        animation: ${pulse} 1.6s ease-in-out infinite;
      `}
    }
  }

  @media (max-height: 500px) {
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.sm}`};
    font-size: 0.8125rem;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;

  > * {
    min-height: 3rem;
  }

  @media (max-height: 500px) {
    > * {
      min-height: 2.75rem;
    }
  }
`;

const MicIcon: React.FC<{ color: string; slashColor: string; slash: boolean }> = ({ color, slashColor, slash }) => (
  <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="9" y="3" width="6" height="11" rx="3" fill={color} />
    <path d="M6 11a6 6 0 0 0 12 0 M12 17v4 M9 21h6" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    {slash && <path d="M4 3 L20 21" stroke={slashColor} strokeWidth="2.4" strokeLinecap="round" />}
  </svg>
);

/**
 * 5e · Cartão de problema no microfone: sem som, barulho ou bloqueado. O medidor usa o nível ao
 * vivo quando há (`level` de 0 a 1); sem medida, mostra o nível típico do problema.
 */
export const MicTroubleCard: React.FC<{
  problem: MicProblem;
  level: number | null;
  status?: string;
  actions: React.ReactNode;
}> = ({ problem, level, status, actions }) => {
  const theme = useTheme();
  const copy = TROUBLE_COPY[problem];
  const fraction = level ?? copy.restingLevel;
  const meterLabel = level === null ? copy.restingLabel : liveLevelLabel(level);
  const color = toneColors(theme, copy.tone).main;
  return (
    <Card $tone={copy.tone} role="alertdialog" aria-labelledby="problema-titulo" aria-describedby="problema-espera">
      <Head>
        <Icon $tone={copy.tone}>
          <MicIcon color={color} slashColor={theme.colors.text} slash={copy.slash} />
        </Icon>
        <div>
          <Kicker $tone={copy.tone}>{copy.kicker}</Kicker>
          <Title id="problema-titulo">{copy.title}</Title>
        </div>
      </Head>

      <MeterBlock>
        <div aria-hidden="true">
          <span>NÍVEL DO MICROFONE</span>
          <span>{meterLabel}</span>
        </div>
        <SegmentMeter fraction={fraction} count={BARS} label={`Nível do microfone: ${meterLabel}`} toneAt={barTone} height="1.125rem" gap="3px" round />
      </MeterBlock>

      <Tips>
        {copy.tips.map(([icon, text]) => (
          <li key={text}>
            <span aria-hidden="true">{icon}</span>
            <span>{text}</span>
          </li>
        ))}
      </Tips>

      <Waiting $tone={copy.tone}>
        <i aria-hidden="true" />
        <span id="problema-espera" role="status">
          {status ?? copy.waiting}
        </span>
      </Waiting>
      <Actions>{actions}</Actions>
    </Card>
  );
};
