import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderScreen } from '../shell/testing';
import { Privacy } from './Privacy';
import { PRIVACY_SECTIONS } from './privacyPolicy';

const text = () => screen.getByRole('article', { name: 'Texto da política' }).textContent ?? '';

describe('Privacy', () => {
  it('título, data da versão e cada seção com o seu título', () => {
    renderScreen(<Privacy />, { path: '/privacidade' });
    expect(screen.getByRole('heading', { level: 1, name: 'Política de privacidade' })).toBeInTheDocument();
    expect(screen.getByText(/Atualizada em 3 de novembro de 2026/)).toBeInTheDocument();
    for (const s of PRIVACY_SECTIONS) expect(screen.getByRole('region', { name: s.title })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Menu/ })).toHaveAttribute('href', '/');
  });

  it('os trechos que pedem revisão jurídica vêm marcados, e só eles', () => {
    renderScreen(<Privacy />, { path: '/privacidade' });
    for (const s of PRIVACY_SECTIONS) {
      const marked = within(screen.getByRole('region', { name: s.title })).queryByText('em revisão jurídica');
      expect(Boolean(marked), s.id).toBe(Boolean(s.review));
    }
  });

  it('diz o que o app faz de verdade: microfone, nome público, áudio de 30 dias, sem anúncio, operadores e como apagar', () => {
    renderScreen(<Privacy />, { path: '/privacidade' });
    const all = text();
    expect(all).toMatch(/microfone serve só para ouvir o violino/);
    expect(all).toMatch(/bicho e um número sorteado/);
    expect(all).toMatch(/apagado 30 dias depois da revisão/);
    expect(all).toMatch(/ouvido só pelo aluno, pelo professor da turma e pelo responsável/);
    expect(all).toMatch(/Não mostramos anúncios/);
    expect(all).toMatch(/Supabase/);
    expect(all).toMatch(/Configurações › Conta › Apagar minha conta/);
    expect(all).toMatch(/conta de aluno da turma é apagada pelo professor/i);
  });
});
