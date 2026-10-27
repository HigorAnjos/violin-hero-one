import React from 'react';
import styled from 'styled-components';
import { useProgress, type Progress } from '../../shell/progress';
import { Button } from '../Button/Button';

const Box = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  background-color: ${({ theme }) => theme.colors.warning.surface};
  border: 2px solid ${({ theme }) => theme.colors.warning.border};
  border-radius: 14px;
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};

  > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.625rem;
  }
`;

/** O que o convidado deste aparelho já fez: músicas diferentes com recorde e selos. */
export function guestLoss({ records, badges }: Pick<Progress, 'records' | 'badges'>): { songs: number; badges: number } {
  return { songs: new Set(records.map((r) => r.songId)).size, badges: badges.length };
}

/** "O que este convidado fez (2 músicas e 1 selo) não vai para essa conta." */
export function lossWarning({ songs, badges }: { songs: number; badges: number }): string {
  const parts = [
    songs ? (songs === 1 ? '1 música' : `${songs} músicas`) : null,
    badges ? (badges === 1 ? '1 selo' : `${badges} selos`) : null,
  ].filter(Boolean);
  return `O que este convidado fez (${parts.join(' e ')}) não vai para essa conta. Fica guardado só com o convidado.`;
}

/**
 * Entrar numa conta que já existe troca o usuário do aparelho: o progresso do convidado não vai junto. Com progresso,
 * `ask` pergunta antes (Ficar é o padrão e o foco começa nele); sem progresso, segue direto.
 */
export function useSwitchConfirm(): { ask: () => Promise<boolean>; dialog: React.ReactNode } {
  const progress = useProgress();
  const loss = guestLoss(progress);
  const [pending, setPending] = React.useState<((go: boolean) => void) | null>(null);
  const stay = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (pending) stay.current?.focus();
  }, [pending]);

  const ask = React.useCallback(() => {
    if (!loss.songs && !loss.badges) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setPending(() => resolve));
  }, [loss.songs, loss.badges]);

  const answer = (go: boolean) => {
    pending?.(go);
    setPending(null);
  };

  const dialog = pending ? (
    <Box role="alertdialog" aria-label="Entrar em outra conta" aria-describedby="vh-guest-loss">
      <p id="vh-guest-loss">{lossWarning(loss)}</p>
      <div>
        <Button ref={stay} type="button" onClick={() => answer(false)}>
          Ficar
        </Button>
        <Button type="button" $variant="ghost" onClick={() => answer(true)}>
          Entrar mesmo assim
        </Button>
      </div>
    </Box>
  ) : null;

  return { ask, dialog };
}
