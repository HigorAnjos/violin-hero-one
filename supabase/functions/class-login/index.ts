// Edge Function class-login: o aluno entra com código da turma + nome (como o professor cadastrou) + PIN de 4 dígitos,
// sem e-mail. A conferência e o bloqueio por tentativas são do banco (violinhero.class_login_check, só service_role); a
// função cria na primeira entrada o usuário de auth do aluno (e-mail sintético em .invalid, que nunca é entregue, e sem
// senha) e devolve uma sessão Supabase dele, gerada por um link mágico do admin (não manda e-mail) trocado aqui mesmo.
// Nenhum segredo vai para o app além da sessão do próprio aluno. A chave de serviço só existe no ambiente do Supabase.
//
// CLASS_LOGIN_IP_LIMIT=on liga o limite por IP; padrão desligado (requer migração 0019 antes do deploy).
// CLASS_LOGIN_IP_DEBUG=on registra só cabeçalhos candidatos; padrão desligado.
// CLASS_LOGIN_IP_HEADER escolhe xff-first, xff-last ou cabeçalho candidato exceto forwarded; padrão último XFF.
// Deploy (não há sessão antes da entrada):
// npx supabase functions deploy class-login --project-ref fgymtxxjlikbfhwxifpu --no-verify-jwt --use-api
// Diagnóstico após deploy:
// npx supabase secrets set CLASS_LOGIN_IP_DEBUG=on --project-ref fgymtxxjlikbfhwxifpu
// Desligue logo após coletar e registre em Decisões o cabeçalho escolhido e o diagnóstico temporário:
// npx supabase secrets unset CLASS_LOGIN_IP_DEBUG --project-ref fgymtxxjlikbfhwxifpu
//
// POST application/json { code, name, pin } (com a chave anon no apikey, como o supabase-js manda)
// Resposta (o contrato de src/services/classroom.ts, studentLogin):
//   200 { session: { access_token, refresh_token, expires_in, expires_at, token_type }, user_id,
//         student: { id, name, class_id, class_name } }
//   4xx/5xx { error: { code, message } } — 400 bad_request, 401 invalid_credentials (código, nome ou PIN não conferem:
//   sempre a mesma resposta), 429 too_many_attempts, 403 class_closed, 500 server
import { createClient } from '@supabase/supabase-js';
import { throttleIp, debugClientIp } from './client-ip.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ErrorCode = 'bad_request' | 'invalid_credentials' | 'too_many_attempts' | 'class_closed' | 'server';

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  invalid_credentials: 401,
  too_many_attempts: 429,
  class_closed: 403,
  server: 500,
};

const MESSAGES: Record<ErrorCode, string> = {
  bad_request: 'Preencha o código da turma, o seu nome e o PIN de 4 números.',
  invalid_credentials: 'Código da turma, nome ou PIN não conferem.',
  too_many_attempts: 'Muitas tentativas. Espere 15 minutos ou peça um PIN novo ao professor.',
  class_closed: 'Essa turma foi encerrada pelo professor.',
  server: 'Não foi possível entrar agora. Tente de novo em instantes.',
};

class LoginError extends Error {
  constructor(readonly code: ErrorCode, detail?: string) {
    super(detail ?? code);
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });

const fail = (code: ErrorCode) => json(STATUS[code], { error: { code, message: MESSAGES[code] } });

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} vazio no ambiente da função`);
  return value;
};

const options = { auth: { persistSession: false, autoRefreshToken: false } };

/** Cliente da chave de serviço no schema violinhero (só aqui, no servidor). */
const serverClient = (url: string) => createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { ...options, db: { schema: 'violinhero' } });
type ServerClient = ReturnType<typeof serverClient>;

/** E-mail do usuário de auth do aluno: o domínio .invalid (RFC 2606) não existe, então nada chega a ninguém. */
const studentEmail = (memberId: string) => `aluno-${memberId}@alunos.violinhero.invalid`;

interface Credentials {
  code: string;
  name: string;
  pin: string;
}

async function readCredentials(req: Request): Promise<Credentials> {
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) throw new LoginError('bad_request');
  const text = await req.text();
  if (text.length > 1024) throw new LoginError('bad_request');
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new LoginError('bad_request');
  }
  const field = (key: string, max: number) => {
    const value = body?.[key];
    if (typeof value !== 'string' || !value.trim() || value.length > max) throw new LoginError('bad_request', key);
    return value;
  };
  return { code: field('code', 20), name: field('name', 60), pin: field('pin', 8) };
}

interface Checked {
  status: 'ok' | 'invalid' | 'locked' | 'closed';
  member_id?: string;
  user_id?: string | null;
  name?: string;
  class_id?: string;
  class_name?: string;
}

/**
 * O usuário de auth do aluno: o já ligado ou um novo (sem senha, e-mail confirmado). Em duas primeiras entradas ao mesmo
 * tempo, quem perde a corrida apaga o que criou e usa o da outra. Se uma entrada anterior criou o usuário e caiu antes
 * de ligar, o e-mail sintético já existe: o banco acha esse usuário por ele e liga (class_link_existing).
 */
async function studentUser(server: ServerClient, memberId: string, linked: string | null | undefined): Promise<string> {
  if (linked) return linked;
  const { data, error } = await server.auth.admin.createUser({
    email: studentEmail(memberId),
    email_confirm: true,
    app_metadata: { violinhero_role: 'student' },
  });
  if (error || !data.user) {
    const { data: kept, error: existingError } = await server.rpc('class_link_existing', { p_member_id: memberId });
    if (existingError || !kept) throw error ?? existingError ?? new Error('createUser sem usuário');
    return kept as string;
  }
  const { data: kept, error: linkError } = await server.rpc('class_link_user', { p_member_id: memberId, p_user_id: data.user.id });
  if (linkError) throw linkError;
  if (kept !== data.user.id) await server.auth.admin.deleteUser(data.user.id);
  return kept as string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fail('bad_request');
  debugClientIp(req, Deno.env.get('CLASS_LOGIN_IP_DEBUG'));
  try {
    const credentials = await readCredentials(req);
    const url = env('SUPABASE_URL');
    const server = serverClient(url);

    const { data, error } = await server.rpc('class_login_check', {
      p_code: credentials.code,
      p_name: credentials.name,
      p_pin: credentials.pin,
      p_ip: throttleIp(req, Deno.env.get('CLASS_LOGIN_IP_LIMIT'), Deno.env.get('CLASS_LOGIN_IP_HEADER')),
    });
    if (error) throw error;
    const checked = data as Checked;
    if (checked.status === 'invalid') throw new LoginError('invalid_credentials');
    if (checked.status === 'locked') throw new LoginError('too_many_attempts');
    if (checked.status === 'closed') throw new LoginError('class_closed');
    if (checked.status !== 'ok' || !checked.member_id) throw new Error(`class_login_check: ${JSON.stringify(checked)}`);

    const userId = await studentUser(server, checked.member_id, checked.user_id);
    // Sessão sem senha guardada: o link mágico do admin não manda e-mail; o hash dele vira sessão aqui mesmo
    const { data: link, error: linkError } = await server.auth.admin.generateLink({ type: 'magiclink', email: studentEmail(checked.member_id) });
    if (linkError) throw linkError;
    const anon = createClient(url, env('SUPABASE_ANON_KEY'), options);
    const { data: verified, error: verifyError } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
    if (verifyError) throw verifyError;
    const session = verified.session;
    // O e-mail sintético é do aluno; se não levar a ele, nada de sessão
    if (!session || verified.user?.id !== userId) throw new Error('a sessão gerada não é do aluno');

    return json(200, {
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_in: session.expires_in,
        expires_at: session.expires_at,
        token_type: session.token_type,
      },
      user_id: userId,
      student: { id: checked.member_id, name: checked.name, class_id: checked.class_id, class_name: checked.class_name },
    });
  } catch (error) {
    if (error instanceof LoginError) return fail(error.code);
    console.error('class-login', error);
    return fail('server');
  }
});
