// Read-only schema and permission verification. No financial rows are queried.
import pg from 'pg';
import { readFileSync } from 'node:fs';
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required.');
const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 15000 });
const names = ['budget_app_projects', 'budget_app_project_entries', 'budget_app_project_funding', 'budget_app_project_requests'];
const sql = readFileSync('supabase/migrations/0012_projects.sql', 'utf8').replaceAll('\r\n', '\n');
const issues = [];
try {
  await db.connect();
  await db.query('begin read only');
  await db.query("set local statement_timeout='20s'");
  const tables = (await db.query(`select c.relname as name,c.relrowsecurity as rls,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anonymous_access,
    has_table_privilege('authenticated',c.oid,'SELECT') as owner_read,
    has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as direct_write
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname=any($1) order by c.relname`, [names])).rows;
  for (const name of names) {
    const table = tables.find((row) => row.name === name);
    if (!table) issues.push(`Missing table: ${name}`);
    else if (!table.rls || table.anonymous_access || !table.owner_read || table.direct_write) issues.push(`Unexpected access configuration: ${name}`);
  }
  const policies = (await db.query(`select tablename,cmd,roles,qual from pg_policies where schemaname='public' and tablename=any($1)`, [names])).rows;
  for (const name of names) if (!policies.some((p) => p.tablename === name && p.cmd === 'SELECT' && p.roles.includes('authenticated') && p.qual?.includes('owner_id') && p.qual?.includes('auth.uid()'))) issues.push(`Missing owner read policy: ${name}`);
  const signatures = ['public.budget_app_manage_project(text,jsonb)', 'public.budget_app_protect_project_transaction()'];
  const functions = [];
  for (const signature of signatures) {
    const fn = (await db.query(`select p.proname,p.prosrc,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
      from pg_proc p where p.oid=to_regprocedure($1)`, [signature])).rows[0];
    if (!fn) { issues.push(`Missing function: ${signature}`); continue; }
    const start = sql.indexOf(`create or replace function public.${fn.proname}(`);
    const bodyStart = sql.indexOf('as $$', start) + 5, bodyEnd = sql.indexOf('$$;', bodyStart);
    const sourceMatches = start >= 0 && bodyStart >= 5 && bodyEnd > bodyStart && sql.slice(bodyStart, bodyEnd).trim() === fn.prosrc.replaceAll('\r\n', '\n').trim();
    if (!sourceMatches) issues.push(`Installed function differs from tested migration: ${fn.proname}`);
    if (fn.anonymous_execute || !fn.proconfig?.some((value) => /^search_path=public,\s*pg_temp$/.test(value))) issues.push(`Unexpected function security: ${fn.proname}`);
    if (fn.proname === 'budget_app_manage_project' && (!fn.prosecdef || !fn.authenticated_execute)) issues.push('Project operation must allow authenticated execution with owner validation');
    functions.push({ name: fn.proname, sourceMatches, anonymousExecute: fn.anonymous_execute, authenticatedExecute: fn.authenticated_execute });
  }
  const trigger = (await db.query(`select t.tgenabled, p.proname from pg_trigger t join pg_proc p on p.oid=t.tgfoid
    where t.tgrelid=to_regclass('public.budget_app_transactions') and t.tgname='budget_app_project_transaction_guard' and not t.tgisinternal`)).rows[0];
  if (!trigger || !['O','A'].includes(trigger.tgenabled) || trigger.proname !== 'budget_app_protect_project_transaction') issues.push('Missing or disabled project transaction guard');
  await db.query('rollback');
  console.log(JSON.stringify({ projectTables: tables, functions, transactionGuardEnabled: !!trigger && ['O','A'].includes(trigger.tgenabled), issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  await db.query('rollback').catch(() => {});
  console.error(`Read-only Projects installation check failed (${error.code ?? 'connection/query failure'}). No changes were made.`);
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
