import pg from 'pg';
import prepareTakes from '../global-setup';

/** Contas de e2e mais velhas que isto saem antes da rodada: nenhum teste do catálogo dura tanto. */
const STALE_MINUTES = 30;

/**
 * Os WAV do microfone falso e, no Supabase local, as contas de e2e (e-mail @t.test) de rodadas anteriores. Todas
 * jogam a mesma música com o placar perfeito do ouvido simulado: o empate vai para quem jogou antes, e o ranking da
 * semana (as 20 primeiras) enche de contas velhas até a conta nova não aparecer para a outra. O nome gerado também
 * começa a repetir. Na CI o banco nasce vazio a cada job e isto não apaga nada.
 */
export default async function globalSetup(): Promise<void> {
  prepareTakes();
  const url = process.env.E2E_DB_URL;
  if (!url || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) return;
  const client = new pg.Client({ connectionString: url, ssl: false });
  await client.connect();
  try {
    // O cascade das FKs para auth.users leva perfil, partidas, recordes, selos e desafios junto
    const { rowCount } = await client.query(
      `delete from auth.users where email like '%@t.test' and created_at < now() - make_interval(mins => $1)`,
      [STALE_MINUTES]
    );
    if (rowCount) console.log(`e2e do catálogo: ${rowCount} contas de rodadas anteriores apagadas do Supabase local`);
  } finally {
    await client.end();
  }
}
