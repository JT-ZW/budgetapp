// Read-only metadata check by default. Use --apply to install Projects.
import pg from 'pg';
import { readFileSync } from 'node:fs';
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required.');
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 15000 });
const applying = process.argv.includes('--apply');
try {
  await client.connect();
  await client.query(applying ? 'begin' : 'begin read only');
  await client.query("set local lock_timeout='5s'");
  await client.query("set local statement_timeout='60s'");
  const { rows: [state] } = await client.query("select to_regclass('public.budget_app_projects') is not null as installed");
  if (state.installed) console.log('Projects migration is already installed.');
  else if (!applying) console.log('Projects migration 0012 is pending. No database changes made.');
  else {
    await client.query(readFileSync(new URL('../supabase/migrations/0012_projects.sql', import.meta.url), 'utf8'));
    console.log('Projects migration installed. Existing wallets and financial records were preserved.');
  }
  await client.query('commit');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(`Projects migration ${applying ? 'rolled back' : 'check failed'} (${error.code ?? 'connection/query failure'}).`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
