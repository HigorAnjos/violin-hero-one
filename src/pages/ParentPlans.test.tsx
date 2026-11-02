import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { cadernoTheme } from '../assets/styles/themes';
import { palcoTheme } from '../assets/styles/themes/palco';
import { pixelTheme } from '../assets/styles/themes/specials';
import { renderScreen } from '../shell/testing';
import { parentDemo } from '../shell/parentDemo';
import { fakeClassroom } from '../services/classroomFake';
import { Parent } from './Parent';
import { Plans } from './Plans';
import { GuestPrompt } from './GuestPrompt';

vi.mock('../services/supabase', () => ({ supabase: null }));
const session = { status: 'signed-in', anonymous: false, userId: 'responsavel', email: 'adulto@exemplo.com' } as const;
function client(value: unknown = session) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(['session'], value);
  return qc;
}

describe.each([cadernoTheme, palcoTheme, pixelTheme])('responsável e planos: $id', theme => {
  it.each([[1280, 720], [844, 390]])('%i × %i: aceita convite, mostra filho e pede URL só ao ouvir', async (width, height) => {
    vi.stubGlobal('innerWidth', width); vi.stubGlobal('innerHeight', height);
    const { api, invite } = await parentDemo();
    const signed = vi.spyOn(api, 'submissionAudioUrl').mockResolvedValue('https://audio.test/assinada');
    const user = userEvent.setup();
    renderScreen(<Parent api={api} />, { theme, path: '/responsavel', queryClient: client() });
    await screen.findByText(/Nenhum filho vinculado/);
    expect(signed).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Código do convite'), invite.code);
    await user.click(screen.getByRole('button', { name: 'Aceitar convite' }));
    await screen.findByRole('heading', { name: 'A semana de Ana' });
    expect(screen.getByText('Continue praticando com calma!')).toBeInTheDocument();
    expect(screen.getByText(/92% de precisão/)).toBeInTheDocument();
    expect(screen.queryByText(/adulto@/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ouvir entrega' }));
    await waitFor(() => expect(screen.getByLabelText('Entrega de Brilha Brilha Estrelinha')).toHaveAttribute('src', 'https://audio.test/assinada'));
    expect(signed).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it.each([[1280, 720], [844, 390]])('%i × %i: planos reais e pro sem assinatura', async () => {
    const api = fakeClassroom(); api.actAs('professor');
    renderScreen(<Plans api={api} />, { theme, path: '/planos' });
    expect(await screen.findByText('2 turmas × 10 alunos')).toBeInTheDocument();
    expect(await screen.findByText('20 turmas × 40 alunos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinatura chega em breve' })).toBeDisabled();
    expect(screen.getByText('Seu plano atual')).toBeInTheDocument();
  });
});

it.each([
  { status: 'signed-in', userId: 'anon', anonymous: true },
  { status: 'offline' },
])('sem conta adulta com e-mail não consulta os filhos (%j)', async session => {
  const api = fakeClassroom(); const list = vi.spyOn(api, 'listMyChildren');
  renderScreen(<Parent api={api} />, { path: '/responsavel', route: '/responsavel', queryClient: client(session) });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/conta?motivo=responsavel'));
  expect(list).not.toHaveBeenCalled();
});

it('aluno não recebe oferta de vincular conta adulta', async () => {
  const api = fakeClassroom(); const list = vi.spyOn(api, 'listMyChildren');
  renderScreen(<Parent api={api} />, { path: '/responsavel', queryClient: client({ status: 'signed-in', userId: 'aluno', anonymous: false }) });
  expect(await screen.findByRole('heading', { name: 'Esta é uma conta de aluno' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Abrir configurações de conta' })).toHaveAttribute('href', '/configuracoes?secao=conta');
  expect(screen.queryByText('Usar e-mail')).not.toBeInTheDocument();
  expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
  expect(list).not.toHaveBeenCalled();
});

it('link direto da conta de responsável também bloqueia vinculação no usuário aluno', async () => {
  renderScreen(<GuestPrompt />, { path: '/conta?motivo=responsavel&depois=/responsavel', queryClient: client({ status: 'signed-in', userId: 'aluno', anonymous: false }) });
  expect(await screen.findByRole('heading', { name: 'Esta é uma conta de aluno' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Usar e-mail' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
});

it('sem sessão resolvida aguarda e não consulta dados de criança', async () => {
  const api = fakeClassroom(); const list = vi.spyOn(api, 'listMyChildren');
  renderScreen(<Parent api={api} />, { path: '/responsavel', route: '/responsavel' });
  expect(screen.getByRole('status')).toHaveTextContent('Conectando…');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/conta?motivo=responsavel'));
  expect(list).not.toHaveBeenCalled();
});

it('trocar de responsável não mostra o filho em cache da conta anterior', async () => {
  const { api, invite } = await parentDemo();
  await api.acceptGuardianInvite(invite.code);
  const qc = client();
  renderScreen(<Parent api={api} />, { queryClient: qc });
  await screen.findByRole('heading', { name: 'A semana de Ana' });
  api.actAs('outro-responsavel');
  // A nova resposta demora: o cache anterior continua existindo, mas não pode aparecer.
  vi.spyOn(api, 'listMyChildren').mockReturnValue(new Promise(() => {}));
  act(() => { qc.setQueryData(['session'], { ...session, userId: 'outro-responsavel' }); });
  await screen.findByText('Carregando filhos…');
  expect(screen.queryByText(/Ana/)).not.toBeInTheDocument();
  expect(screen.queryByText('Continue praticando com calma!')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Entrega de Brilha Brilha Estrelinha')).not.toBeInTheDocument();
});

it('convite recusado preserva formulário e permite tentar de novo', async () => {
  const { api, invite } = await parentDemo();
  const user = userEvent.setup();
  renderScreen(<Parent api={api} />, { queryClient: client() });
  await screen.findByText(/Nenhum filho vinculado/);
  await user.type(screen.getByLabelText('Código do convite'), 'ABCDEFGHJK');
  await user.click(screen.getByRole('button', { name: 'Aceitar convite' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/Confira o código/);
  await user.clear(screen.getByLabelText('Código do convite'));
  await user.type(screen.getByLabelText('Código do convite'), invite.code);
  await user.click(screen.getByRole('button', { name: 'Aceitar convite' }));
  await screen.findByRole('heading', { name: 'A semana de Ana' });
});

it('planos: falha de rede oferece nova tentativa', async () => {
  const api = fakeClassroom(); api.failNext('offline');
  renderScreen(<Plans api={api} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão');
  await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

it('áudio tem duração, falha recuperável e remoção explícita; não mostra outro filho', async () => {
  const { api, invite } = await parentDemo();
  const child = await api.acceptGuardianInvite(invite.code);
  const progress = await api.getStudentProgress(child.studentId);
  progress.assignments[0].submission!.audioDurationMs = 12500;
  vi.spyOn(api, 'getStudentProgress').mockResolvedValue(progress);
  const signed = vi.spyOn(api, 'submissionAudioUrl').mockRejectedValue(new Error('offline'));
  const first = renderScreen(<Parent api={api} />, { queryClient: client() });
  await screen.findByText('Duração: 13 s');
  await userEvent.click(screen.getByRole('button', { name: 'Ouvir entrega' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar');
  expect(screen.queryByText('Outro aluno')).not.toBeInTheDocument();
  first.unmount();
  progress.assignments[0].submission!.audioDeleted = true;
  renderScreen(<Parent api={api} />, { queryClient: client() });
  expect(await screen.findByText('O áudio foi removido após o prazo de retenção.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ouvir entrega' })).not.toBeInTheDocument();
  expect(signed).toHaveBeenCalledTimes(1);
});
