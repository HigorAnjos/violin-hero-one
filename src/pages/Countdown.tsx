import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { rgba } from '../assets/styles/themes/color';
import { Button } from '../components/Button/Button';
import { CountIn, useCountIn } from '../components/CountIn/CountIn';
import { firstNote, LEVEL_NAMES } from '../components/CountIn/countIn';
import { OrchestraBackdrop } from '../components/OrchestraBackdrop/OrchestraBackdrop';
import { Kicker } from '../components/Screen/Screen';
import type { Song } from '../game/notation/song';
import { STRING_LETTERS } from '../game/notation/violin';
import { FIXED_SONGS } from '../game/notation/songs';
import type { PlayState } from '../shell/play';
import { loadGameScreens } from './loadGameScreens';
import { ROUTES, safeInternalPath } from '../shell/routes';

/** O que quem abre a contagem passa pelo estado da navegação; segue adiante para o jogo. */
export interface CountdownState extends PlayState {
  /** Rota do jogo quando a contagem acaba; padrão: a Gameplay. */
  next?: string;
}

const Page = styled.main`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
`;

const Veil = styled.div`
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    ${({ theme }) => rgba(theme.colors.background, 0.9)} 70%,
    ${({ theme }) => rgba(theme.colors.background, 0.55)}
  );
  pointer-events: none;
`;

const Center = styled.div`
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.375rem;
  padding: ${({ theme }) => theme.spacing.md};
  text-align: center;

  @media (max-height: 500px) {
    gap: ${({ theme }) => theme.spacing.xs};
  }
`;

const Cue = styled.span`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 1.625rem;
  color: ${({ theme }) => theme.colors.info.text};

  @media (max-height: 500px) {
    font-size: 1.25rem;
  }
`;

const NotePanel = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.5rem 1.125rem;
  padding: 0.875rem 1.25rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.sm};
  box-shadow: 0 3px 0 ${({ theme }) => theme.colors.surfaceBorder};
  font-size: 0.9375rem;
  color: ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    padding: ${({ theme }) => `${theme.spacing.xxs} ${theme.spacing.md}`};
  }
`;

const NoteName = styled.span<{ $string: (typeof STRING_LETTERS)[number] }>`
  font-family: ${({ theme }) => theme.fonts.display};
  font-size: 1.75rem;
  color: ${({ theme, $string }) => theme.game.strings[$string].main};

  @media (max-height: 500px) {
    font-size: 1.375rem;
  }
`;

const Bow = styled.span`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const Details = styled.span`
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.textMuted};

  @media (max-height: 500px) {
    font-size: 0.75rem;
  }
`;

/** "1 compasso de entrada · 112 BPM · latência 142 ms descontada". */
export function countdownDetails(song: Song, latencyMs?: number): string {
  const parts = ['1 compasso de entrada', `${Math.round(song.bpm)} BPM`];
  if (latencyMs !== undefined) parts.push(`latência ${Math.round(latencyMs)} ms descontada`);
  return parts.join(' · ');
}

/** 4b · Contagem: um compasso de entrada no andamento da música, com a primeira nota à vista. */
export const Countdown: React.FC = () => {
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as CountdownState;
  // Vindo do onboarding, sem música escolhida: a primeira das músicas fixas
  const song = state.song ?? FIXED_SONGS[0].song;
  const next = safeInternalPath(state.next ?? null, ROUTES.game);
  const { mode, latencyMs, noFail } = state;
  const start = React.useCallback(
    () => navigate(next, { replace: true, state: { song, mode, latencyMs, noFail } satisfies PlayState }),
    [navigate, next, song, mode, latencyMs, noFail]
  );
  const view = useCountIn(song, start);
  // O compasso de entrada dá tempo de baixar a tela de jogo antes de precisar dela
  React.useEffect(() => void loadGameScreens().catch(() => undefined), []);
  const note = firstNote(song);
  const label = [song.title, state.mode ?? 'Arcade', LEVEL_NAMES[song.level]].join(' · ');

  return (
    <Page>
      <OrchestraBackdrop />
      <Veil aria-hidden="true" />
      <Center>
        <Kicker>{label}</Kicker>
        <CountIn view={view} bpm={song.bpm} />
        <Cue>Levante o arco</Cue>
        {note && (
          <NotePanel>
            <Kicker>Primeira nota</Kicker>
            <NoteName $string={STRING_LETTERS[note.string]}>{note.name}</NoteName>
            <span>{note.where}</span>
            <Bow>
              <svg width="20" height="14" viewBox="0 0 22 16" aria-hidden="true">
                <path d="M2 15V2h18v13" fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
              para baixo
            </Bow>
          </NotePanel>
        )}
        <Details>{countdownDetails(song, state.latencyMs)}</Details>
        <Button type="button" $variant="link" onClick={start}>
          Pular contagem <span aria-hidden="true">▸</span>
        </Button>
      </Center>
    </Page>
  );
};
