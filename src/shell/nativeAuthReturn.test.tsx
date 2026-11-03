import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { NativeAuthClient } from '../services/nativeAuth';
import { closeExternal } from '../services/platform';
import { useNativeAuthReturn } from './nativeAuthReturn';

const app = vi.hoisted(() => ({ listener: undefined as ((url: string) => void) | undefined }));
vi.mock('../services/platform', () => ({
  isNative: () => true,
  onAppUrl: (listener: (url: string) => void) => {
    app.listener = listener;
    return () => (app.listener = undefined);
  },
  closeExternal: vi.fn(async () => undefined),
}));

const Probe: React.FC<{ client: NativeAuthClient }> = ({ client }) => {
  useNativeAuthReturn(client);
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
};

describe('useNativeAuthReturn', () => {
  it('a volta do Google fecha o navegador, troca o código e abre a tela que pediu a conta', async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ data: {}, error: null });
    const client = { auth: { exchangeCodeForSession, setSession: vi.fn() } } as unknown as NativeAuthClient;
    const { unmount } = render(
      <MemoryRouter initialEntries={['/entrar']}>
        <Probe client={client} />
      </MemoryRouter>
    );
    app.listener?.('app.violinhero://auth/conta?code=abc');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/conta$/));
    expect(exchangeCodeForSession).toHaveBeenCalledWith('abc');
    expect(closeExternal).toHaveBeenCalled();
    unmount();
    expect(app.listener).toBeUndefined();
  });

  it('erro na volta: a tela fica com o #error_code', async () => {
    const client = { auth: { exchangeCodeForSession: vi.fn(), setSession: vi.fn() } } as unknown as NativeAuthClient;
    render(
      <MemoryRouter initialEntries={['/entrar']}>
        <Probe client={client} />
      </MemoryRouter>
    );
    app.listener?.('app.violinhero://auth/entrar#error_code=otp_expired');
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/entrar#error_code=otp_expired'));
  });
});
