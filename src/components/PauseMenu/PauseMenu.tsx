import React from 'react';
import styled from 'styled-components';
import { rgba } from '../../assets/styles/themes/color';
import { volumeLabel } from '../../game/synth';
import { Button } from '../Button/Button';
import { Kicker } from '../Screen/Screen';
import { clock } from '../SheetStrip/staff';

const Veil = styled.div`
  position: absolute;
  inset: 0 0 10.625rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.spacing.lg};
  padding: ${({ theme }) => theme.spacing.md};

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-color: ${({ theme }) => rgba(theme.colors.background, 0.6)};
  }

  @media (max-height: 500px) {
    inset: 0 0 7.25rem;
    gap: ${({ theme }) => theme.spacing.sm};
    padding: ${({ theme }) => theme.spacing.xs};
  }
`;

const Panel = styled.section`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
  padding: 1.5rem 1.75rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};
  box-shadow: ${({ theme }) => theme.shadows.card};

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
    padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
    max-height: 100%;
    overflow-y: auto;
  }
`;

const Menu = styled(Panel)`
  width: 25rem;
  border-color: ${({ theme }) => theme.colors.primary.main};

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 2.75rem;
    line-height: 1;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;

    > * {
      justify-content: space-between;
    }
  }

  > small {
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    width: 25rem;

    h1 {
      font-size: 1.75rem;
    }

    nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${({ theme }) => theme.spacing.xs};

      > * {
        padding: 0 0.625rem;
        font-size: 0.75rem;
        letter-spacing: 0.04em;
      }
    }

    > small {
      display: none;
    }
  }
`;

const Settings = styled(Panel)`
  width: 21.25rem;
  align-self: stretch;
  margin: 2.5rem 0;

  label {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    font-size: 0.875rem;

    span {
      display: flex;
      justify-content: space-between;
    }

    b {
      font-weight: 400;
      color: ${({ theme }) => theme.colors.textMuted};
    }

    input {
      width: 100%;
      height: 2.75rem;
      accent-color: ${({ theme }) => theme.colors.primary.main};
    }
  }

  > p {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  kbd {
    padding: 0.25rem 0.4375rem;
    border: 1px solid ${({ theme }) => theme.colors.surfaceBorder};
    border-radius: 3px;
    background-color: ${({ theme }) => theme.game.track};
    font-family: inherit;
    font-size: 0.75rem;
    color: ${({ theme }) => theme.colors.text};
  }

  @media (max-height: 500px) {
    width: 12.5rem;
    margin: 0;

    > p {
      display: none;
    }
  }
`;

const Progress = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1rem;
  color: ${({ theme }) => theme.colors.textMuted};

  > div {
    flex: 1;
    height: 0.5rem;
    border-radius: 4px;
    background-color: ${({ theme }) => theme.colors.surfaceBorder};
  }

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background-color: ${({ theme }) => theme.colors.info.main};
  }

  @media (max-height: 500px) {
    display: none;
  }
`;

const Count = styled.p`
  font-family: ${({ theme }) => theme.fonts.display};
  font-weight: 800;
  font-size: 4rem;
  line-height: 1;
  text-align: center;
  color: ${({ theme }) => theme.colors.text};
`;

export interface PauseMenuProps {
  /** "Ode à Alegria · Fácil". */
  subtitle: string;
  elapsed: number;
  total: number;
  volume: number;
  onVolume: (volume: number) => void;
  onContinue: () => void;
  onRestart: () => void;
  onRetune: () => void;
  onExit: () => void;
  /** Tempos que faltam na contagem de volta; null fora dela. */
  counting: number | null;
  /** A aba saiu de vista e o microfone fechou: continuar reabre. */
  micClosed?: boolean;
}

/** 6 · Pausa: o jogo e a orquestra param juntos; ao continuar, conta um compasso. */
export const PauseMenu: React.FC<PauseMenuProps> = ({ subtitle, elapsed, total, volume, onVolume, onContinue, onRestart, onRetune, onExit, counting, micClosed = false }) => {
  const first = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => first.current?.focus(), []);

  if (counting !== null) {
    return (
      <Veil>
        <Menu role="dialog" aria-modal="true" aria-label="Voltando ao jogo">
          <Kicker>Voltando em</Kicker>
          <Count role="timer" aria-live="assertive">
            {counting}
          </Count>
        </Menu>
      </Veil>
    );
  }

  return (
    <Veil>
      <Menu role="dialog" aria-modal="true" aria-labelledby="pausa-titulo">
        <div>
          <h1 id="pausa-titulo">PAUSADO</h1>
          <Kicker as="p">{subtitle}</Kicker>
        </div>
        <Progress>
          <span>{clock(elapsed)}</span>
          <div role="progressbar" aria-label="Andamento da música" aria-valuemin={0} aria-valuemax={100} aria-valuenow={total ? Math.round((elapsed / total) * 100) : 0}>
            <i style={{ width: `${total ? Math.min(100, (elapsed / total) * 100) : 0}%` }} />
          </div>
          <span>{clock(total)}</span>
        </Progress>
        <nav aria-label="Opções de pausa">
          <Button ref={first} type="button" onClick={onContinue}>
            <span>Continuar</span>
            <span aria-hidden="true">▸</span>
          </Button>
          <Button type="button" $variant="ghost" onClick={onRestart}>
            Reiniciar música
          </Button>
          <Button type="button" $variant="ghost" onClick={onRetune}>
            Afinar de novo
          </Button>
          <Button type="button" $variant="ghost" onClick={onExit}>
            Sair para músicas
          </Button>
        </nav>
        <small>{micClosed ? 'O microfone fechou quando a tela saiu de vista: continuar abre de novo e conta 1 compasso.' : 'Ao continuar, o jogo conta 1 compasso antes da próxima nota.'}</small>
      </Menu>
      <Settings aria-label="Ajustes rápidos">
        <Kicker>Ajustes rápidos</Kicker>
        <label>
          <span>
            Volume da orquestra<b>{volumeLabel(volume)}</b>
          </span>
          <input type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => onVolume(Number(e.target.value) / 100)} />
        </label>
        <p>
          <kbd>ESC</kbd>
          <span>continuar</span>
        </p>
      </Settings>
    </Veil>
  );
};
