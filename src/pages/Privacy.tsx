import React from 'react';
import styled from 'styled-components';
import { BackLink, navigationPageInsets } from '../components/BackLink/BackLink';
import { Kicker } from '../components/Screen/Screen';
import { PRIVACY_CONTACT_EMAIL, PRIVACY_SECTIONS, PRIVACY_UPDATED_AT } from './privacyPolicy';

/** A página toda cabe na janela; o texto rola por dentro (como Configurações). */
const Page = styled.main`
  height: 100vh;
  height: 100dvh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 1rem;
  overflow: hidden;
  ${navigationPageInsets}

  @media (max-height: 500px) {
    gap: 0.5rem;
  }
`;

const Header = styled.header`
  min-width: 0;

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.625rem;
    line-height: 2rem;
    color: ${({ theme }) => theme.colors.text};
  }

  p {
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    h1 {
      font-size: 1.25rem;
      line-height: 1.5rem;
    }

    p {
      font-size: 0.75rem;
    }
  }
`;

const Text = styled.article`
  grid-column: 1 / -1;
  min-height: 0;
  overflow-y: auto;
  max-width: 48rem;
  /* Espaço para o anel de foco do link de contato na borda */
  padding: 0.25rem;
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.9375rem;
  line-height: 1.5rem;

  section + section {
    margin-top: 1.25rem;
  }

  h2 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.25rem 0.75rem;
    margin-bottom: 0.25rem;
  }

  p + p,
  p + ul,
  ul + p {
    margin-top: 0.5rem;
  }

  ul {
    padding-left: 1.25rem;
    list-style: disc;
  }

  a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: ${({ theme }) => theme.colors.info.text};
    text-decoration: underline;
  }

  @media (max-height: 500px) {
    font-size: 0.875rem;
    line-height: 1.375rem;
  }
`;

/** Marca do trecho que ainda passa por revisão jurídica. */
const Review = styled.span`
  font-family: ${({ theme }) => theme.fonts.ui};
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0;
  text-transform: none;
  color: ${({ theme }) => theme.colors.warning.text};
`;

const updated = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(PRIVACY_UPDATED_AT));

/** Política de privacidade: pública (sem sessão), linkada em Configurações › Conta, no Entrar e nas fichas das lojas. */
export const Privacy: React.FC = () => (
  <Page>
    <Header>
      <h1>Política de privacidade</h1>
      <p>Atualizada em {updated}. Trechos marcados ainda passam por revisão jurídica e podem mudar.</p>
    </Header>
    <BackLink />
    <Text aria-label="Texto da política">
      {PRIVACY_SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`vh-priv-${s.id}`}>
          <h2>
            <Kicker id={`vh-priv-${s.id}`}>{s.title}</Kicker>
            {s.review && <Review>em revisão jurídica</Review>}
          </h2>
          {s.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.items && (
            <ul>
              {s.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <section aria-labelledby="vh-priv-contato">
        <h2>
          <Kicker id="vh-priv-contato">Contato</Kicker>
        </h2>
        <p>
          {PRIVACY_CONTACT_EMAIL ? (
            <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
          ) : (
            'O e-mail de contato para privacidade será publicado aqui antes do lançamento nas lojas.'
          )}
        </p>
      </section>
    </Text>
  </Page>
);
