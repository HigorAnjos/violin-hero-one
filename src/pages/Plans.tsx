import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { classroomKeys, ClassroomError, type ClassroomApi } from '../services/classroom';
import type { SessionState } from '../services/session';
import { parentClassroom } from '../shell/parentClassroom';
import { readPlansBack } from '../shell/plansBack';
import { isStudentSession } from '../shell/studentSession';
import { useSession } from '../shell/useAccount';
import { ClassroomCard, ClassroomContent, ClassroomGrid, ClassroomPage } from './classroomLayout';

/** Quem pode ter turma: conta com e-mail ou Google (require_teacher). Convidado e aluno não têm plano para mostrar. */
export function isTeacherAccount(session: SessionState | undefined): boolean {
  return session?.status === 'signed-in' && !session.anonymous && !isStudentSession(session);
}

function PlanList({ api }: { api: ClassroomApi }) {
  const teacher = isTeacherAccount(useSession());
  const plans = useQuery({ queryKey: classroomKeys.plans, queryFn: () => api.listPlans(), retry: false });
  const mine = useQuery({ queryKey: classroomKeys.plan, queryFn: () => api.getMyPlan(), retry: false, enabled: teacher });
  return <ClassroomContent>
    <p>Turmas, tarefas e acompanhamento para aprender tocando de verdade.</p>
    {teacher && mine.data && <p>Seu plano: <b>{mine.data.plan.name}</b> · {mine.data.openClasses} de {mine.data.plan.maxOpenClasses} turmas abertas</p>}
    {(plans.isPending || (teacher && mine.isPending)) && <p role="status">Carregando planos…</p>}
    {(plans.error || mine.error) && <div role="alert"><p>{(plans.error ?? mine.error) instanceof ClassroomError ? (plans.error ?? mine.error)!.message : 'Não foi possível carregar os planos.'}</p><Button onClick={() => { void plans.refetch(); if (teacher) void mine.refetch(); }}>Tentar de novo</Button></div>}
    <ClassroomGrid>{plans.data?.map(plan => <ClassroomCard key={plan.id} aria-label={`Plano ${plan.name}`}>
      <h2>{plan.name}</h2><p><b>{plan.maxOpenClasses} turmas × {plan.maxStudentsPerClass} alunos</b></p>
      <ul><li>Até {plan.maxOpenClasses} turmas abertas</li><li>Até {plan.maxStudentsPerClass} alunos ativos por turma</li><li>Tarefas, entregas e revisões do professor</li><li>Aluno entra sem e-mail</li><li>Área do responsável</li></ul>
      {teacher && mine.data?.plan.id === plan.id && <p>Seu plano atual</p>}
      {plan.id === 'pro' && <Button disabled>Assinatura chega em breve</Button>}
    </ClassroomCard>)}</ClassroomGrid>
    <small>Sem cobrança neste momento. A assinatura será disponibilizada depois.</small>
  </ClassroomContent>;
}
export function Plans({ api: provided }: { api?: ClassroomApi }) {
  const api = useQuery({ queryKey: ['plans-api'], queryFn: parentClassroom, enabled: !provided, staleTime: Infinity });
  const back = readPlansBack(useLocation().state);
  return <ClassroomPage><header><div><small>PLANOS</small><h1>Mais espaço para sua turma</h1></div>{back ? <BackLink to={back.to} label={back.label} /> : <BackLink />}</header>{provided ? <PlanList api={provided} /> : api.data ? <PlanList api={api.data} /> : <p role="status">Conectando…</p>}</ClassroomPage>;
}
