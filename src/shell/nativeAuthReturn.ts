import React from 'react';
import { useNavigate } from 'react-router-dom';
import { completeAuthReturn, type NativeAuthClient } from '../services/nativeAuth';
import { closeExternal, onAppUrl } from '../services/platform';
import { supabase } from '../services/supabase';

/**
 * No celular, a volta do link mágico e do Google (app.violinhero://auth/…): fecha o navegador do sistema, troca o
 * código pela sessão e abre a tela que pediu a conta. A sessão nova chega às telas pelo useAccountWatch, como na
 * web. Na web, onAppUrl nunca chama e nada muda.
 */
export function useNativeAuthReturn(client: NativeAuthClient | null = supabase): void {
  const navigate = useNavigate();
  React.useEffect(
    () =>
      onAppUrl((url) => {
        void closeExternal();
        void completeAuthReturn(client, url).then((screen) => {
          if (screen) navigate(screen, { replace: true });
        });
      }),
    [client, navigate]
  );
}
