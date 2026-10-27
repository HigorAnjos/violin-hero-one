import React from 'react';
import styled from 'styled-components';
import { DURATION_NAMES, DURATIONS, type Duration } from '../../game/notation/editor';
import type { EditorAction } from '../../shell/useScoreEditor';

const Bar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.xxs};
`;

/** Ferramenta da paleta (.vh-tool do design), com a área de toque de 44 px. */
export const Tool = styled.button`
  position: relative;
  min-width: 2.75rem;
  height: 2.75rem;
  padding: 0 0.375rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.music};
  font-size: 1.375rem;
  line-height: 1;

  &[aria-pressed='true'] {
    background-color: ${({ theme }) => theme.colors.text};
    border-color: ${({ theme }) => theme.colors.text};
    color: ${({ theme }) => theme.colors.surface};
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  @media (hover: hover) {
    &:hover:not(:disabled, [aria-pressed='true']) {
      border-color: ${({ theme }) => theme.colors.textMuted};
    }
  }

  kbd {
    position: absolute;
    right: 3px;
    bottom: 2px;
    font: 700 0.75rem/1 ${({ theme }) => theme.fonts.ui};
    opacity: 0.7;

    @media (pointer: coarse), (max-height: 500px) {
      display: none;
    }
  }
`;

const Word = styled(Tool)`
  font-family: ${({ theme }) => theme.fonts.ui};
  font-weight: 800;
  font-size: 1.125rem;
`;

const Separator = styled.span`
  width: 1px;
  height: 1.625rem;
  margin: 0 0.25rem;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};
`;

const GLYPH: Record<Duration, string> = { 4: '𝅝', 2: '𝅗𝅥', 1: '♩', 0.5: '♪', 0.25: '𝅘𝅥𝅯' };
const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface NotePaletteProps {
  duration: Duration;
  dotted: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAction(action: EditorAction): void;
}

/** Ferramentas de nota (ScoreEditor.dc): figuras com a tecla, ponto, pausa, acidentes, ligadura, desfazer e refazer. */
export const NotePalette: React.FC<NotePaletteProps> = ({ duration, dotted, canUndo, canRedo, onAction }) => (
  <Bar role="toolbar" aria-label="Ferramentas de nota">
    {DURATIONS.map((d, i) => (
      <Tool key={d} type="button" aria-label={capitalized(DURATION_NAMES[d])} aria-pressed={d === duration} onClick={() => onAction({ type: 'duration', duration: d })}>
        <span aria-hidden="true">{GLYPH[d]}</span>
        <kbd aria-hidden="true">{i + 1}</kbd>
      </Tool>
    ))}
    <Word type="button" aria-label="Ponto de aumento" aria-pressed={dotted} onClick={() => onAction({ type: 'dot' })}>
      <span aria-hidden="true">·</span>
      <kbd aria-hidden="true">.</kbd>
    </Word>
    <Tool type="button" aria-label="Pausa" onClick={() => onAction({ type: 'rest' })}>
      <span aria-hidden="true">𝄽</span>
      <kbd aria-hidden="true">0</kbd>
    </Tool>
    <Separator aria-hidden="true" />
    <Tool type="button" aria-label="Sustenido" onClick={() => onAction({ type: 'accidental', accidental: 'sharp' })}>
      <span aria-hidden="true">♯</span>
    </Tool>
    <Tool type="button" aria-label="Bemol" onClick={() => onAction({ type: 'accidental', accidental: 'flat' })}>
      <span aria-hidden="true">♭</span>
    </Tool>
    <Tool type="button" aria-label="Bequadro" onClick={() => onAction({ type: 'accidental', accidental: 'natural' })}>
      <span aria-hidden="true">♮</span>
    </Tool>
    <Tool type="button" aria-label="Ligadura" onClick={() => onAction({ type: 'tie' })}>
      <span aria-hidden="true">‿</span>
      <kbd aria-hidden="true">L</kbd>
    </Tool>
    <Separator aria-hidden="true" />
    <Word type="button" aria-label="Desfazer" disabled={!canUndo} onClick={() => onAction({ type: 'undo' })}>
      <span aria-hidden="true">↶</span>
    </Word>
    <Word type="button" aria-label="Refazer" disabled={!canRedo} onClick={() => onAction({ type: 'redo' })}>
      <span aria-hidden="true">↷</span>
    </Word>
  </Bar>
);
