// Read-only metadata audit. No financial records, users, or secrets are printed.
import pg from 'pg';
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required for the optional database metadata audit.');
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, connectionTimeoutMillis: 15000 });
try {
  await client.connect();
  await client.query('begin read only');
  const { rows: tables } = await client.query(`
    select c.relname as name, c.relrowsecurity as rls,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anonymous_access
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and starts_with(c.relname,'budget_app_')
    order by c.relname
  `);
  const { rows: functions } = await client.query(`
    select p.proname as name, pg_get_function_identity_arguments(p.oid) as arguments,
      has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and starts_with(p.proname,'budget_app_')
      and p.prosecdef and p.prorettype <> 'trigger'::regtype order by p.proname
  `);
  const { rows: policies } = await client.query(`
    select tablename as table_name, policyname, cmd, qual, with_check
    from pg_policies where schemaname='public' and starts_with(tablename,'budget_app_')
    order by tablename,policyname
  `);
  const issues = tables.filter((table) => !table.rls || table.anonymous_access).map((table) => `Review table access: ${table.name}`);
  for (const fn of functions) if (fn.anonymous_execute) issues.push(`Review anonymous execution: ${fn.name}`);
  for (const name of ['budget_app_credits', 'budget_app_sessions']) if (!tables.some((table) => table.name === name)) issues.push(`Missing required table: ${name}`);
  for (const name of ['budget_app_manage_credit', 'budget_app_session']) if (!functions.some((fn) => fn.name === name)) issues.push(`Missing required function: ${name}`);
  await client.query('rollback');
  console.log(JSON.stringify({ tables, privilegedFunctions: functions, policies, issues }, null, 2));
  if (issues.length) process.exitCode = 1;
} catch (error) {
  console.error(`Database metadata audit could not complete (${error.code ?? 'connection/query failure'}). No changes were made.`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
