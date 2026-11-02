import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SessionState } from '../services/session';
import { NotForStudents } from './NotForStudents';
import { isStudentSession } from './studentSession';
import { renderScreen } from './testing';

vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));

function open(session: SessionState) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['session'], session);
  renderScreen(<NotForStudents><p>ranking</p></NotForStudents>, { path: '/ranking', route: '/ranking', queryClient });
}

describe('fora do ranking e do desafio', () => {
  it('só a conta sem e-mail e não anônima é de aluno', () => {
    expect(isStudentSession({ status: 'signed-in', userId: 'a', anonymous: false })).toBe(true);
    expect(isStudentSession({ status: 'signed-in', userId: 'c', anonymous: false, email: 'x@y.z' })).toBe(false);
    expect(isStudentSession({ status: 'signed-in', userId: 'g', anonymous: true })).toBe(false);
    expect(isStudentSession({ status: 'offline' })).toBe(false);
  });

  it('o aluno que abre o ranking (ou o link do desafio) vai às tarefas; conta com e-mail vê', () => {
    open({ status: 'signed-in', userId: 'a', anonymous: false });
    expect(screen.queryByText('ranking')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/tarefas');
  });

  it('conta com e-mail vê o ranking', () => {
    open({ status: 'signed-in', userId: 'c', anonymous: false, email: 'x@y.z' });
    expect(screen.getByText('ranking')).toBeInTheDocument();
  });
});
