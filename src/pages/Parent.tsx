import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { BackLink } from '../components/BackLink/BackLink';
import { Button } from '../components/Button/Button';
import { StudentGuardianNotice } from '../components/StudentGuardianNotice';
import { ClassroomError, classroomKeys, REVIEW_CONCEPTS, type Child, type ClassroomApi, type StudentAssignment } from '../services/classroom';
import { accountUrl, ROUTES } from '../shell/routes';
import { useSession } from '../shell/useAccount';
import { isParentDemo, parentClassroom } from '../shell/parentClassroom';
import { ClassroomCard, ClassroomContent, ClassroomGrid, ClassroomPage } from './classroomLayout';
import { instructionOf, taskLabel } from './teacherText';

const message = (error: unknown) => error instanceof ClassroomError ? error.message : 'Não foi possível carregar agora. Tente de novo.';

function Delivery({ task, api }: { task: StudentAssignment; api: ClassroomApi }) {
  const [url, setUrl] = React.useState<string>();
  const [error, setError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => () => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); }, [url]);
  const audio = task.submission;
  const listen = async () => {
    setBusy(true); setError(undefined);
    try { setUrl(await api.submissionAudioUrl(audio!.audioPath!)); }
    catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };
  // Nível e modo no título, como o professor vê: duas tarefas da mesma música não saem iguais
  const title = taskLabel(task);
  const instruction = instructionOf(task);
  return <ClassroomCard aria-label={title}>
    <h2>{title}</h2>
    <p>{task.review ? 'Revisada' : audio ? 'Enviada' : 'Para fazer'} · Prazo: {new Date(task.dueAt).toLocaleDateString('pt-BR')}</p>
    {instruction && <p>Recado do professor: {instruction}</p>}
    {audio?.accuracy != null && <p>Precisão da entrega: {audio.accuracy.toLocaleString('pt-BR')}%</p>}
    {task.best?.meanAbsCents != null && <p>Afinação da melhor partida: desvio médio de {task.best.meanAbsCents.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} cents</p>}
    {task.review && <div><b>Revisão do professor: {task.review.concept ? REVIEW_CONCEPTS[task.review.concept] : `${task.review.grade}/5`}</b><p>{task.review.comment}</p></div>}
    {audio?.audioDeleted ? <p>O áudio foi removido após o prazo de retenção.</p> : audio?.audioPath ? <>
      {audio.audioDurationMs != null && <small>Duração: {Math.ceil(audio.audioDurationMs / 1000)} s</small>}
      <Button type="button" $variant="ghost" disabled={busy} onClick={listen}>{busy ? 'Preparando áudio…' : url ? 'Renovar áudio' : 'Ouvir entrega'}</Button>
      {url && <audio key={url} controls src={url} aria-label={`Entrega de ${title}`} style={{ width: '100%', minHeight: 44 }} onError={() => setError('Não foi possível tocar o áudio. Tente renovar o endereço.')} />}
    </> : audio && <p>Entrega sem áudio.</p>}
    {error && <p role="alert">{error}</p>}
  </ClassroomCard>;
}

function ChildProgress({ studentId, api, viewer }: { studentId: string; api: ClassroomApi; viewer: string }) {
  const progress = useQuery({ queryKey: [...classroomKeys.progress(studentId), viewer], queryFn: () => api.getStudentProgress(studentId), retry: false });
  if (progress.isPending) return <p role="status">Carregando progresso…</p>;
  if (progress.isError) return <div role="alert">{message(progress.error)} <Button onClick={() => void progress.refetch()}>Tentar de novo</Button></div>;
  const data = progress.data;
  return <>
    <h2>A semana de {data.student.name}</h2>
    <ClassroomGrid>
      <ClassroomCard aria-label="Minutos de prática"><h2>Prática nos últimos 7 dias</h2><p><b>{data.minutesLast7Days} minutos</b></p><p>Sequência de {data.streak?.currentDays ?? 0} dias · melhor: {data.streak?.bestDays ?? 0} dias</p></ClassroomCard>
      <ClassroomCard aria-label="Afinação"><h2>Afinação e precisão</h2><small>A precisão considera as notas e o tempo da partida. A afinação de cada tarefa aparece abaixo quando há medida.</small>{data.records.length ? data.records.map(r => <p key={`${r.songId}-${r.level}`}>{r.songTitle}: {r.accuracy.toLocaleString('pt-BR')}% de precisão</p>) : <p>Ainda não há partidas concluídas.</p>}</ClassroomCard>
    </ClassroomGrid>
    <h2>Tarefas e revisões do professor</h2>
    {data.assignments.length ? <ClassroomGrid>{data.assignments.map(task => <Delivery key={task.id} task={task} api={api} />)}</ClassroomGrid> : <p>Nenhuma tarefa por enquanto.</p>}
    <small>O áudio fica disponível por 30 dias depois da revisão. Só o aluno, o professor da turma e os responsáveis vinculados podem ouvir.</small>
  </>;
}

function ParentArea({ api, viewer }: { api: ClassroomApi; viewer: string }) {
  const queryClient = useQueryClient();
  const children = useQuery({ queryKey: [...classroomKeys.children, viewer], queryFn: () => api.listMyChildren(), retry: false });
  const [selected, setSelected] = React.useState('');
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ error: boolean; text: string }>();
  const current = children.data?.find(c => c.studentId === selected) ?? children.data?.[0];
  const accept = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(undefined);
    try {
      const child = await api.acceptGuardianInvite(code.replace(/[^a-z0-9]/gi, '').toUpperCase());
      // O filho entra na lista com a resposta do aceite; a lista do servidor relê por fora, sem segurar a tela
      queryClient.setQueryData<Child[]>([...classroomKeys.children, viewer], (list) => list && [...list.filter((c) => c.studentId !== child.studentId), child]);
      void queryClient.invalidateQueries({ queryKey: classroomKeys.children });
      setSelected(child.studentId); setCode(''); setNotice({ error: false, text: 'Convite aceito. Agora você pode acompanhar seu filho.' });
    } catch (cause) { setNotice({ error: true, text: message(cause) }); }
    finally { setBusy(false); }
  };
  return <ClassroomContent>
    <ClassroomCard aria-label="Vincular filho"><h2>Convite do professor</h2><p>Peça o código ao professor. Ele tem 10 símbolos, vale 7 dias e é de uso único.</p>
      <form onSubmit={accept} style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <label>Código do convite<br /><input value={code} onChange={e => setCode(e.target.value)} autoCapitalize="characters" autoComplete="off" required pattern="(?:[^a-zA-Z0-9]*[a-zA-Z0-9]){10}[^a-zA-Z0-9]*" maxLength={24} /></label>
        <Button disabled={busy} type="submit">{busy ? 'Aceitando…' : 'Aceitar convite'}</Button>
      </form>
      {notice && <p role={notice.error ? 'alert' : 'status'}>{notice.text}</p>}
    </ClassroomCard>
    {children.isPending && <p role="status">Carregando filhos…</p>}
    {children.isError && <div role="alert">{message(children.error)} <Button onClick={() => void children.refetch()}>Tentar de novo</Button></div>}
    {children.data?.length === 0 && <p>Nenhum filho vinculado ainda. Aceite um convite para começar.</p>}
    {!!children.data?.length && <label>Filho<select value={current?.studentId} onChange={e => setSelected(e.target.value)}>{children.data.map(c => <option key={c.studentId} value={c.studentId}>{c.name} · {c.className}{c.classClosed ? ' (turma encerrada)' : ''}</option>)}</select></label>}
    {current && <ChildProgress key={current.studentId} studentId={current.studentId} api={api} viewer={viewer} />}
  </ClassroomContent>;
}

export function Parent({ api: provided }: { api?: ClassroomApi }) {
  const session = useSession();
  const demo = isParentDemo();
  const allowed = demo || (session?.status === 'signed-in' && !session.anonymous && !!session.email);
  const viewer = demo ? 'demo' : session?.status === 'signed-in' ? session.userId : '';
  const api = useQuery({ queryKey: ['parent-api', demo], queryFn: parentClassroom, enabled: allowed && !provided, staleTime: Infinity });
  if (!demo && session?.status === 'signed-in' && !session.anonymous && !session.email) return <ClassroomPage><header><BackLink /></header><StudentGuardianNotice /></ClassroomPage>;
  if (session && !allowed) return <Navigate to={accountUrl('responsavel', ROUTES.parent, ROUTES.home)} replace />;
  return <ClassroomPage><header><div><small>ÁREA DO RESPONSÁVEL</small><h1>Acompanhe seu filho</h1></div><BackLink /></header>{provided && allowed ? <ParentArea key={viewer} api={provided} viewer={viewer} /> : api.data && allowed ? <ParentArea key={viewer} api={api.data} viewer={viewer} /> : <p role="status">Conectando…</p>}</ClassroomPage>;
}
