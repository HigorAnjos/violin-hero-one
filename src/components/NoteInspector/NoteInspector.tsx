import React from 'react';
import styled, { useTheme } from 'styled-components';
import type { Finger } from '../../game/notation/song';
import { STRING_LETTERS, STRING_SOLFEGE, type StringIndex } from '../../game/notation/violin';
import type { EditorAction } from '../../shell/useScoreEditor';

const Panel = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xs};
  padding: 0.875rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.lg};

  @media (max-height: 500px) {
    padding: ${({ theme }) => theme.spacing.xs} ${({ theme }) => theme.spacing.sm};
  }
`;

const Top = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.xs};
  font-size: 0.75rem;
  color: ${({ theme }) => theme.colors.textMuted};

  b {
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
`;

const Name = styled.p`
  display: flex;
  align-items: baseline;
  gap: 0.625rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  b {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.75rem;
    line-height: 1;
    color: ${({ theme }) => theme.colors.primary.main};
  }
`;

const Group = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.xxs};

  > span {
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: ${({ theme }) => theme.colors.textMuted};
  }
`;

const Choices = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xxs};
`;

/** Botão de escolha (.vh-c): a corda vem na cor dela, sempre com o nome junto. */
const Choice = styled.button<{ $color?: string }>`
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding: 0 0.5rem;
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme, $color }) => $color ?? theme.colors.text};
  font-family: ${({ theme }) => theme.fonts.ui};
  font-weight: 800;
  font-size: 0.875rem;

  &[aria-pressed='true'] {
    background-color: ${({ theme, $color }) => $color ?? theme.colors.text};
    border-color: ${({ theme, $color }) => $color ?? theme.colors.text};
    color: ${({ theme }) => theme.colors.surface};
  }
`;

const Hint = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 ${({ theme }) => theme.spacing.xs};
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  button {
    min-height: 2.75rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.info.text};
  }
`;

const Empty = styled.p`
  font-size: 0.8125rem;
  line-height: 1.25rem;
  color: ${({ theme }) => theme.colors.textMuted};
`;

export interface InspectedNote {
  /** "Fá♯5". */
  name: string;
  /** "semínima · 1 tempo". */
  figure: string;
  /** "comp. 6 · tempo 3". */
  where: string;
  string: StringIndex;
  finger: Finger;
  /** Corda e dedo escolhidos pela pessoa (senão, o sugerido pelo app). */
  chosen: boolean;
  firstPosition: boolean;
}

export interface NoteInspectorProps {
  note: InspectedNote | null;
  onAction(action: EditorAction): void;
  className?: string;
}

const FINGERS: readonly Finger[] = [0, 1, 2, 3, 4];

/** Nota selecionada (ScoreEditor.dc): nome, figura e onde está; a corda e o dedo sugeridos, que a pessoa pode trocar. */
export const NoteInspector: React.FC<NoteInspectorProps> = ({ note, onAction, className }) => (
  <Panel aria-label="Nota selecionada" className={className}>
    <Top>
      <b>Nota selecionada</b>
      {note && <span>{note.where}</span>}
    </Top>
    {note ? (
      <>
        <Name>
          <b>{note.name}</b>
          {note.figure}
        </Name>
        <Group role="group" aria-label="Corda">
          <span aria-hidden="true">CORDA</span>
          <Choices>
            {STRING_SOLFEGE.map((label, i) => (
              <StringChoice key={label} index={i as StringIndex} label={label} pressed={note.string === i} onAction={onAction} />
            ))}
          </Choices>
        </Group>
        <Group role="group" aria-label="Dedo">
          <span aria-hidden="true">DEDO</span>
          <Choices>
            {FINGERS.map((f) => (
              <Choice key={f} type="button" aria-pressed={note.finger === f} aria-label={f === 0 ? 'Corda solta' : `Dedo ${f}`} onClick={() => onAction({ type: 'finger', finger: f })}>
                {f}
              </Choice>
            ))}
          </Choices>
        </Group>
        <Hint>
          {note.chosen ? (
            <>
              Escolhido por você.
              <button type="button" onClick={() => onAction({ type: 'suggested' })}>
                Voltar ao sugerido
              </button>
            </>
          ) : (
            `Sugerido pelo app (${note.firstPosition ? '1ª posição' : 'até a 3ª posição'}). Mude se seu professor ensinou outro.`
          )}
        </Hint>
      </>
    ) : (
      <Empty>Nenhuma nota aqui. Toque na pauta ou use as letras A a G para escrever.</Empty>
    )}
  </Panel>
);

const StringChoice: React.FC<{ index: StringIndex; label: string; pressed: boolean; onAction: NoteInspectorProps['onAction'] }> = ({ index, label, pressed, onAction }) => {
  const theme = useTheme();
  return (
    <Choice $color={theme.game.strings[STRING_LETTERS[index]].main} type="button" aria-pressed={pressed} onClick={() => onAction({ type: 'string', string: index })}>
      {label}
    </Choice>
  );
};
