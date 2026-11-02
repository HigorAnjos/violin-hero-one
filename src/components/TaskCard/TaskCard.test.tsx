import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StudentAssignment } from '../../services/classroom';
import { renderScreen } from '../../shell/testing';
import { TaskCard } from './TaskCard';
import { dueLabel, percent, reviewMark, taskStatus } from './taskStatus';

// Segunda-feira, 2 de novembro de 2026, 10:00 no fuso do teste
const NOW = new Date(2026, 10, 2, 10, 0);
const at = (days: number, hour = 18) => new Date(2026, 10, 2 + days, hour, 0).toISOString();

const task = (over: Partial<StudentAssignment> = {}): StudentAssignment => ({
  id: 't1', classId: 'c', songId: 's', songTitle: 'Escala de Ré maior', level: 'easy', mode: 'arcade',
  instructionKey: null, instructionText: null, createdAt: at(-1), dueAt: at(4), closed: false,
  best: null, submission: null, review: null, ...over,
});
const submission = { id: 'e', playId: 'p', score: 100, accuracy: 90, submittedAt: at(-1, 16), audioPath: null, audioDeleted: false };

describe('situação da tarefa', () => {
  it('revisada vem antes de entregue; sem entrega, o prazo decide', () => {
    expect(taskStatus(task())).toBe('todo');
    expect(taskStatus(task({ closed: true }))).toBe('missed');
    expect(taskStatus(task({ submission, closed: true }))).toBe('submitted');
    expect(taskStatus(task({ submission, review: { grade: 4, concept: null, comment: '', reviewedAt: at(0) } }))).toBe('reviewed');
  });

  it('prazo em palavras: hoje, amanhã, dia da semana, data; passado', () => {
    expect(dueLabel(at(0), NOW)).toBe('até hoje, 18:00');
    expect(dueLabel(at(1), NOW)).toBe('até amanhã');
    expect(dueLabel(at(4), NOW)).toBe('até sexta');
    expect(dueLabel(at(19), NOW)).toBe('até 21/11');
    expect(dueLabel(at(-1), NOW)).toBe('prazo foi 1/11');
  });

  it('conceito ou nota; porcentagem com vírgula', () => {
    expect(reviewMark({ grade: null, concept: 'muito-bom' })).toBe('Muito bom');
    expect(reviewMark({ grade: 4, concept: null })).toBe('Nota 4 de 5');
    expect(percent(94.06)).toBe('94,1%');
  });

  it('o cartão mostra a etiqueta, a música e o melhor até agora com o prazo, e abre ao tocar', async () => {
    const select = vi.fn();
    renderScreen(<TaskCard task={task({ best: { playId: 'p', score: 1, accuracy: 86, playedAt: at(0) } })} current now={NOW} onSelect={select} />);
    const card = screen.getByRole('button', { name: /Para fazer Escala de Ré maior Melhor até agora 86% · até sexta/ });
    expect(card).toHaveAttribute('aria-current', 'true');
    await userEvent.click(card);
    expect(select).toHaveBeenCalled();
  });
});
