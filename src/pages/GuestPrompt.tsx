import React from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { ANIMAL_LOOK } from '../components/AvatarPicker/AvatarPicker';
import { Button } from '../components/Button/Button';
import { EmailLinkForm } from '../components/EmailLinkForm/EmailLinkForm';
import { Kicker } from '../components/Screen/Screen';
import { AccountError, authErrorFromUrl, linkEmail, linkGoogle, sendLoginLink } from '../services/account';
import { supabase } from '../services/supabase';
import { useProgress } from '../shell/progress';
import { parseAccountUrl, type AccountReason } from '../shell/routes';
import { useAuthProviders, useSession } from '../shell/useAccount';

const Backdrop = styled.main`
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background-color: ${({ theme }) => theme.colors.overlay};
`;

const Dialog = styled.section`
  width: min(35rem, 100%);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.75rem 1.875rem 1.5rem;
  background-color: ${({ theme }) => theme.colors.background};
  border: 2.5px solid ${({ theme }) => theme.colors.text};
  border-radius: 22px;
  box-shadow: 0 6px 0 ${({ theme }) => theme.colors.text};

  @media (max-height: 500px) {
    width: min(48rem, 100%);
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;

  > span:first-child {
    width: 4rem;
    height: 4rem;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: ${({ theme }) => theme.borderRadius.pill};
    background-color: ${({ theme }) => theme.colors.warning.surface};
    font-size: 2rem;
  }

  h1 {
    font-family: ${({ theme }) => theme.fonts.display};
    font-weight: 800;
    font-size: 1.75rem;
    line-height: 1.05;
    color: ${({ theme }) => theme.colors.text};
  }

  p {
    font-size: 0.9375rem;
    color: ${({ theme }) => theme.colors.textMuted};
  }

  @media (max-height: 500px) {
    > span:first-child {
      width: 2.75rem;
      height: 2.75rem;
      font-size: 1.5rem;
    }

    h1 {
      font-size: 1.375rem;
    }
  }
`;

const Owned = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.875rem 1rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 2px solid ${({ theme }) => theme.colors.surfaceBorder};
  border-radius: 14px;

  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.375rem;
    font-size: 0.875rem;
    color: ${({ theme }) => theme.colors.text};
  }

  dl > div {
    display: flex;
    flex-direction: column-reverse;
  }

  dd {
    font-weight: 800;
    font-size: 1.25rem;
    line-height: 1.2;
  }

  @media (max-height: 500px) {
    padding: 0.5rem 0.875rem;
  }
`;

const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.625rem;

  > button {
    min-height: 3.125rem;
  }

  @media (max-height: 500px) {
    flex-direction: row;

    > button {
      flex: 1;
      min-height: 2.75rem;
    }
  }
`;

const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.8125rem;
  color: ${({ theme }) => theme.colors.textMuted};

  a {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    font-weight: 800;
    color: ${({ theme }) => theme.colors.info.text};
    text-decoration: none;
  }
`;

const Notice = styled.p<{ $error: boolean }>`
  font-size: 0.875rem;
  color: ${({ theme, $error }) => ($error ? theme.colors.danger.text : theme.colors.success.text)};
`;

const QUESTION: Record<AccountReason, string> = {
  ranking: 'Quer aparecer no ranking',
  desafio: 'Quer desafiar um amigo',
  aparelho: 'Quer usar em outro aparelho',
};

/** "Quer aparecer no ranking, Lia?" — só o apelido, nunca nome real nem e-mail. */
export function promptTitle(reason: AccountReason, nickname: string | null): string {
  return `${QUESTION[reason]}${nickname ? `, ${nickname}` : ''}?`;
}

const errorMessage = (cause: unknown) => (cause instanceof AccountError ? cause : new AccountError('server', cause)).message;

/**
 * 0d · Conta só quando precisa: aparece na hora em que a conta é pedida (ranking, desafio, outro aparelho), nunca
 * antes de jogar. Criar conta liga e-mail ou Google ao mesmo usuário: tudo que já é dele vai junto. "Agora não"
 * volta para onde estava.
 */
export const GuestPrompt: React.FC = () => {
  const [params] = useSearchParams();
  const { reason, next, back } = parseAccountUrl(params);
  const navigate = useNavigate();
  const session = useSession();
  const providers = useAuthProviders();
  const progress = useProgress();
  const [emailOpen, setEmailOpen] = React.useState(false);
  const [takenEmail, setTakenEmail] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<{ text: string; error: boolean } | null>(() => {
    const kind = authErrorFromUrl(window.location.href);
    return kind ? { text: new AccountError(kind).message, error: true } : null;
  });
  const titleId = React.useId();

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') navigate(back);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, back]);

  if (session?.status === 'signed-in' && !session.anonymous) return <Navigate to={next} replace />;
  const offline = session?.status === 'offline';

  const google = async () => {
    setNotice(null);
    try {
      await linkGoogle(supabase, next);
    } catch (cause) {
      setNotice({ text: errorMessage(cause), error: true });
    }
  };

  const enterTaken = async () => {
    if (!takenEmail || !session) return;
    setNotice(null);
    try {
      await sendLoginLink(supabase, session, takenEmail, next);
      setNotice({ text: `Mandamos um link para ${takenEmail}. Abra o e-mail neste aparelho e toque no link.`, error: false });
    } catch (cause) {
      setNotice({ text: errorMessage(cause), error: true });
    }
  };

  const songs = new Set(progress.records.map((r) => r.songId)).size;
  const look = progress.animal ? ANIMAL_LOOK[progress.animal] : null;

  return (
    <Backdrop>
      <Dialog role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <Head>
          <span aria-hidden="true">{look?.emoji ?? '🎻'}</span>
          <div>
            <h1 id={titleId}>{promptTitle(reason, progress.nickname)}</h1>
            <p>Para isso precisamos de uma conta. Leva 10 segundos.</p>
          </div>
        </Head>

        <Owned>
          <Kicker>O que já é seu e vai junto</Kicker>
          <dl>
            <div>
              <dt>{songs === 1 ? 'música tocada' : 'músicas tocadas'}</dt>
              <dd>{songs}</dd>
            </div>
            <div>
              <dt>{progress.badges.length === 1 ? 'selo' : 'selos'}</dt>
              <dd>{progress.badges.length}</dd>
            </div>
            {progress.streakDays !== null && (
              <div>
                <dt>de sequência</dt>
                <dd>{progress.streakDays === 1 ? '1 dia' : `${progress.streakDays} dias`}</dd>
              </div>
            )}
          </dl>
        </Owned>

        {offline ? (
          <Notice role="alert" $error>
            {new AccountError('offline').message}
          </Notice>
        ) : (
          <>
            <Actions>
              {providers.google && (
                <Button type="button" onClick={google}>
                  Continuar com Google
                </Button>
              )}
              <Button type="button" $variant={providers.google ? 'ghost' : 'primary'} aria-expanded={emailOpen} onClick={() => setEmailOpen((open) => !open)}>
                Usar e-mail
              </Button>
            </Actions>
            {emailOpen && (
              <EmailLinkForm
                autoFocus
                submitLabel="Mandar link"
                send={(email) => {
                  setTakenEmail(null);
                  return linkEmail(supabase, email, next);
                }}
                onError={(error, email) => setTakenEmail(error.kind === 'taken' ? email : null)}
              />
            )}
            {takenEmail && (
              <Button type="button" $variant="ghost" onClick={enterTaken}>
                Entrar nessa conta
              </Button>
            )}
            {notice && (
              <Notice role={notice.error ? 'alert' : 'status'} $error={notice.error}>
                {notice.text}
              </Notice>
            )}
          </>
        )}

        <Foot>
          <span>Menor de 13? Peça para um responsável criar.</span>
          <Link to={back}>Agora não</Link>
        </Foot>
      </Dialog>
    </Backdrop>
  );
};
