import { render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { describe, expect, it } from 'vitest';
import { cadernoTheme } from '../../assets/styles/themes';
import { TaskProgress, taskSlices, taskSummary } from './TaskProgress';

describe('TaskProgress', () => {
  it('fatias somam a turma e o texto diz só o que existe', () => {
    expect(taskSlices({ studentCount: 6, submittedCount: 3, reviewedCount: 2 })).toEqual({ reviewed: 2, toReview: 1, missing: 3 });
    expect(taskSummary({ studentCount: 6, submittedCount: 3, reviewedCount: 2 })).toBe('2 revisadas · 1 para revisar · 3 sem entrega');
    expect(taskSummary({ studentCount: 3, submittedCount: 3, reviewedCount: 1 })).toBe('1 revisada · 2 para revisar');
    expect(taskSummary({ studentCount: 0, submittedCount: 0, reviewedCount: 0 })).toBe('Nenhum aluno ativo');
  });

  it('a barra é imagem com o mesmo texto', () => {
    render(
      <ThemeProvider theme={cadernoTheme}>
        <TaskProgress studentCount={4} submittedCount={2} reviewedCount={1} />
      </ThemeProvider>
    );
    expect(screen.getByRole('img', { name: '1 revisada · 1 para revisar · 2 sem entrega' })).toBeInTheDocument();
  });
});
