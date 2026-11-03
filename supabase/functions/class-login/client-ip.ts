export const IP_HEADERS = [
  'x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'true-client-ip',
  'x-client-ip', 'x-envoy-external-address', 'fly-client-ip', 'forwarded',
] as const;

/** Padrão histórico: último XFF. A origem confiável será escolhida após diagnóstico na nuvem. */
export function clientIp(req: Request, mode = ''): string {
  let value: string | null | undefined;
  if (!mode || mode === 'xff-last') value = req.headers.get('x-forwarded-for')?.split(',').at(-1);
  else if (mode === 'xff-first') value = req.headers.get('x-forwarded-for')?.split(',')[0];
  else if (mode !== 'forwarded' && IP_HEADERS.some((header) => header === mode)) value = req.headers.get(mode);
  // Configuração inválida ou cabeçalho ausente: conserva a origem histórica.
  if (!value?.trim()) value = req.headers.get('x-forwarded-for')?.split(',').at(-1);
  return (value?.trim() || '').slice(0, 64);
}

export function debugClientIp(req: Request, enabled: string | undefined, log = console.log): void {
  if (enabled === 'on') log('class-login ip headers', Object.fromEntries(IP_HEADERS.map((header) => [header, req.headers.get(header)])));
}
