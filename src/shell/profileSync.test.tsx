import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { publicNameKey } from '../services/profile';
import type { ProfileSyncClient } from '../services/profileSync';
import { useRemoteProfile } from './profileSync';

vi.mock('../services/supabase', () => ({ supabase: null }));

describe('useRemoteProfile', () => {
  it('trazido o perfil do servidor (com o bicho pendente já enviado), o nome público é relido', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['session'], { status: 'signed-in', userId: 'u1', anonymous: false });
    queryClient.setQueryData(publicNameKey, 'Gato 48213');
    const rpc = vi.fn().mockResolvedValue({ data: { animal: 'fox', level: 'beginner', a4_hz: 442 }, error: null });
    const client = { from: vi.fn(), rpc } as unknown as ProfileSyncClient;
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useRemoteProfile(client), { wrapper });
    await waitFor(() => expect(result.current.data?.animal).toBe('fox'));
    expect(rpc).toHaveBeenCalledWith('ensure_my_profile');
    expect(queryClient.getQueryState(publicNameKey)?.isInvalidated).toBe(true);
  });
});
