import React from 'react';
import styled, { css } from 'styled-components';
import type { StudentAssignment } from '../../services/classroom';
import { taskVariant } from '../../shell/taskLabel';
import { clampLines } from '../Screen/Screen';
import { dueLabel, percent, reviewMark, shortDate, STATUS_LABELS, taskStatus, type TaskStatus } from './taskStatus';

/** .vh-task do design: a tarefa na lista, que abre o detalhe ao lado. */
const Card = styled.button<{ $muted: boolean }>`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.375rem;
  width: 100%;
  min-height: 2.75rem;
  padding: 0.875rem 1rem;
  text-align: left;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: ${({ theme }) => theme.borderRadius.md};
  color: ${({ theme }) => theme.colors.text};
  opacity: ${({ $muted }) => ($muted ? 0.8 : 1)};

  &[aria-current='true'] {
    border-color: ${({ theme }) => theme.colors.text};
    box-shadow: 0 4px 0 ${({ theme }) => theme.colors.text};
  }

  b {
    ${clampLines(1)}
    max-width: 100%;
    font-size: 1rem;
    font-weight: 800;
  }

  small {
    ${clampLines(1)}
    max-width: 100%;
    font-size: 0.8125rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    gap: 0.125rem;
    padding: 0.375rem 0.625rem;

    b {
      font-size: 0.875rem;
    }

    small {
      font-size: 0.75rem;
    }
  }
`;

/** .vh-st do design: a etiqueta da situação, sempre com texto (a cor só reforça). */
export const StatusTag = styled.span<{ $status: TaskStatus }>`
  padding: 0.3125rem 0.5625rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  font-weight: 800;
  font-size: 0.75rem;
  line-height: 1;
  letter-spacing: 0.1em;
  text-transform: uppercase;

  ${({ theme, $status }) => {
    switch ($status) {
      case 'reviewed':
        return css`
          background-color: ${theme.colors.info.main};
          color: ${theme.colors.background};
        `;
      case 'submitted':
        return css`
          background-color: ${theme.colors.surfaceHover};
          color: ${theme.colors.textMuted};
        `;
      case 'missed':
        return css`
          border: 1.5px solid ${theme.colors.danger.border};
          color: ${theme.colors.danger.text};
        `;
      default:
        return css`
          border: 1.5px solid ${theme.colors.text};
          color: ${theme.colors.text};
        `;
    }
  }}
`;

export function taskSummary(task: StudentAssignment, now: Date): string {
  const status = taskStatus(task);
  if (status === 'reviewed') return `${reviewMark(task.review!)} · o professor comentou`;
  if (status === 'submitted') return `Entregue em ${shortDate(new Date(task.submission!.submittedAt))}`;
  const best = task.best ? `Melhor até agora ${percent(task.best.accuracy)} · ` : '';
  return `${best}${dueLabel(task.dueAt, now)}`;
}

export const TaskCard: React.FC<{ task: StudentAssignment; current: boolean; now: Date; onSelect(): void }> = ({ task, current, now, onSelect }) => {
  const status = taskStatus(task);
  return (
    <Card type="button" aria-current={current} onClick={onSelect} $muted={status === 'reviewed' || status === 'missed'}>
      <StatusTag $status={status}>{STATUS_LABELS[status]}</StatusTag>
      <b>{task.songTitle}</b>
      {/* Nível e modo numa linha própria: duas tarefas da mesma música não saem iguais na lista */}
      <small>{taskVariant(task)}</small>
      <small>{taskSummary(task, now)}</small>
    </Card>
  );
};
