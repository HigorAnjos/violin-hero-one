import React from 'react';
import { Navigate } from 'react-router-dom';
import { ROUTES } from './routes';
import { useIsStudent } from './studentSession';

/** Ranking e desafio: a conta de aluno da turma não entra (o servidor também barra); quem abre o link vai às tarefas. */
export const NotForStudents: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  useIsStudent() ? <Navigate to={ROUTES.tasks} replace /> : <>{children}</>;
