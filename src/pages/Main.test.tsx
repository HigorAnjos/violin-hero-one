import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '../assets/styles/themes';
import { levelSettings } from '../game/engine/levels';
import { findFixedSong, FIXED_SONGS } from '../game/notation/songs';
import { A4_STORAGE_KEY } from '../services/playerAudio';
import { PROFILE_STORAGE_KEY } from '../services/profile';
import { QueryClient } from '@tanstack/react-query';
import { fakeClassroom } from '../services/classroomFake';
import { setClassroomShell } from '../shell/classroom';
import { fakeClassroomShell } from '../shell/simulatedClassroom';
import { renderScreen } from '../shell/testing';
import { ThemeChoiceProvider } from '../shell/ThemeChoice';
import { Main as MainScreen } from './Main';

// Sem banco: com o .env.local da máquina, a tela ia à rede de verdade e estourava os 5 s do teste
vi.mock('../services/supabase', () => ({ supabase: null, supabaseUrl: '', supabaseAnonKey: '' }));

const Main = () => (
  <ThemeChoiceProvider>
    <MainScreen />
  </ThemeChoiceProvider>
);

const menu = () => within(screen.getByRole('navigation', { name: 'Menu principal' }));

describe('Main', () => {
  afterEach(() => window.localStorage.clear());

  it('marca, menu e a música sugerida para quem está começando', async () => {
    renderScreen(<Main />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Violin\s*Hero/);
    const title = findFixedSong(levelSettings('beginner').firstSongId)!.title;
    expect(menu().getByRole('link', { name: new RegExp(`^Tocar ${title}`) })).toBeInTheDocument();
    expect(menu().getByRole('link', { name: 'Afinar Lá 442' })).toBeInTheDocument();
    // Sem banco no teste: a estante são as embutidas
    expect(await menu().findByRole('link', { name: `Biblioteca ${FIXED_SONGS.length}` }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('aluno da turma: Tarefas no menu com quantas faltam, e sem o troféu do ranking', async () => {
    const fake = fakeClassroom({ userId: 'professora' });
    const turma = await fake.createClass('Turma');
    const { pin } = await fake.addStudent(turma.id, 'Ana');
    await fake.createAssignment({ classId: turma.id, songId: 'brilha-brilha', level: 'easy', mode: 'arcade', dueAt: new Date(Date.now() + 86400e3).toISOString() });
    const { userId } = fake.login({ code: turma.code, name: 'Ana', pin });
    setClassroomShell(fakeClassroomShell(fake));
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['session'], { status: 'signed-in', userId, anonymous: false });
    renderScreen(<Main />, { queryClient });
    expect(await menu().findByRole('link', { name: 'Tarefas 1 a fazer' })).toHaveAttribute('href', '/tarefas');
    expect(screen.queryByRole('link', { name: 'Ranking' })).not.toBeInTheDocument();
    setClassroomShell(null);
  });

  it('convidado não vê Tarefas e vê o ranking', () => {
    renderScreen(<Main />);
    expect(menu().queryByRole('link', { name: /^Tarefas/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ranking' })).toBeInTheDocument();
  });

  it('a sugestão segue o nível guardado e o Lá segue a afinação salva', () => {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ level: 'never' }));
    window.localStorage.setItem(A4_STORAGE_KEY, '440');
    window.localStorage.setItem(THEME_STORAGE_KEY, 'palco');
    renderScreen(<Main />);
    expect(document.documentElement.dataset.theme).toBe('palco');
    const title = findFixedSong(levelSettings('never').firstSongId)!.title;
    expect(menu().getByRole('link', { name: new RegExp(`^Tocar ${title}`) })).toBeInTheDocument();
    expect(menu().getByRole('link', { name: 'Afinar Lá 440' })).toBeInTheDocument();
  });

  it('Afinar mantém Cordas 3D como modo padrão', async () => {
    renderScreen(<Main />);
    await userEvent.click(menu().getByRole('link', { name: 'Afinar Lá 442' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/afinar');
    expect(JSON.parse(screen.getByTestId('location').getAttribute('data-state')!)).toMatchObject({ mode: 'Cordas 3D' });
  });

  it('Tocar leva à escolha de modo; Biblioteca, à biblioteca', async () => {
    renderScreen(<Main />);
    await userEvent.click(menu().getByRole('link', { name: /^Tocar/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/tocar');
  });

  it('Ranking, Configurações e Perfil no canto, sessão Offline sem banco', async () => {
    renderScreen(<Main />);
    expect(screen.getByRole('link', { name: 'Ranking' })).toHaveAttribute('href', '/ranking');
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/configuracoes');
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveAttribute('href', '/perfil');
    expect(await screen.findByText('Offline', undefined, { timeout: 5000 })).toBeInTheDocument();
  });

  it('o bicho escolhido aparece no botão do Perfil', () => {
    localStorage.setItem('vh:profile', JSON.stringify({ level: 'beginner', nickname: null, animal: 'cat' }));
    renderScreen(<Main />);
    expect(screen.getByRole('link', { name: 'Perfil' })).toHaveTextContent('🐱');
  });
});
