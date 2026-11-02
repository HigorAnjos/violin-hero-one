import styled from 'styled-components';

export interface TaskCounts {
  studentCount: number;
  submittedCount: number;
  reviewedCount: number;
}

/** Revisadas, para revisar e sem entrega (as fatias da barra do design, que somam a turma). */
export function taskSlices({ studentCount, submittedCount, reviewedCount }: TaskCounts) {
  const reviewed = Math.min(reviewedCount, studentCount);
  const toReview = Math.max(0, Math.min(submittedCount, studentCount) - reviewed);
  return { reviewed, toReview, missing: Math.max(0, studentCount - reviewed - toReview) };
}

/** "2 revisadas · 1 revisar · 3 sem entrega" (só o que existe). */
export function taskSummary(counts: TaskCounts): string {
  const { reviewed, toReview, missing } = taskSlices(counts);
  if (!counts.studentCount) return 'Nenhum aluno ativo';
  const parts = [
    reviewed && `${reviewed} ${reviewed === 1 ? 'revisada' : 'revisadas'}`,
    toReview && `${toReview} para revisar`,
    missing && `${missing} sem entrega`,
  ].filter(Boolean);
  return parts.join(' · ');
}

const Bar = styled.span`
  display: flex;
  height: 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.pill};
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.surfaceBorder};

  > i:nth-child(1) {
    background-color: ${({ theme }) => theme.colors.info.main};
  }

  > i:nth-child(2) {
    background-color: ${({ theme }) => theme.colors.text};
  }
`;

/** A barra da tarefa; o texto ao lado diz o mesmo (a barra é imagem com rótulo). */
export const TaskProgress = (counts: TaskCounts) => {
  const { reviewed, toReview } = taskSlices(counts);
  const width = (n: number) => `${counts.studentCount ? (100 * n) / counts.studentCount : 0}%`;
  return (
    <Bar role="img" aria-label={taskSummary(counts)}>
      <i style={{ width: width(reviewed) }} />
      <i style={{ width: width(toReview) }} />
    </Bar>
  );
};
