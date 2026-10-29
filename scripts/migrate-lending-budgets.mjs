// Metadata check by default. Pass --apply to install the two feature migrations.
// Never reads or prints financial records or credentials.
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
  if (applying) await client.query("select pg_advisory_xact_lock(hashtext('budget-app-lending-budgets'))");
  const { rows: [state] } = await client.query(`select
    exists(select 1 from pg_constraint where conrelid='public.budget_app_credits'::regclass
      and conname='budget_app_credits_parties_check') as lending,
    exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='budget_app_budget_targets' and column_name='period_end') as custom_budgets`);
  for (const [key, file] of [['lending', '0009_lending.sql'], ['custom_budgets', '0010_custom_budget_periods.sql']]) {
    if (state[key]) console.log(`${file}: already installed`);
    else if (!applying) console.log(`${file}: pending`);
    else {
      await client.query(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
      console.log(`${file}: applied in transaction`);
    }
  }
  await client.query('commit');
  console.log(applying ? 'Feature migrations committed. Existing financial records were preserved.' : 'Read-only migration check complete.');
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(`Migration ${applying ? 'rolled back' : 'check failed'} (${error.code ?? 'connection error'}).`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
