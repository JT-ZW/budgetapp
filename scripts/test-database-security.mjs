// Reproduce Supabase's default grants, then audit both documented setup paths.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
for (const setup of ['migrations', 'sql-editor']) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated; create role anon; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      grant usage on schema auth to authenticated,anon;
      alter default privileges in schema public grant all on tables to anon;
      alter default privileges in schema public grant execute on functions to anon;
    `);
    const files = setup === 'migrations'
      ? migrations.map((name) => `supabase/migrations/${name}`)
      : ['supabase/SETUP_BUDGET_APP.sql', 'supabase/PROJECT_WALLET_CURRENCIES.sql', 'supabase/BUDGET_PERIODS_AND_SAVINGS.sql', ...migrations.filter((name) => !name.startsWith('0001_')).map((name) => `supabase/migrations/${name}`)];
    for (const file of files) await db.exec(readFileSync(file, 'utf8').replaceAll('create extension if not exists pgcrypto;', ''));
    const tables = (await db.query(`select c.relname as name,c.relrowsecurity as rls,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anon_access
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and starts_with(c.relname,'budget_app_')`)).rows;
    assert.equal(tables.length, 16);
    assert.ok(tables.every((table) => table.rls && !table.anon_access), 'all app tables need RLS and no anonymous grants');
    const exposed = (await db.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and starts_with(p.proname,'budget_app_') and has_function_privilege('anon',p.oid,'EXECUTE')`)).rows;
    assert.deepEqual(exposed, [], 'anonymous callers cannot invoke app functions');
    const owner = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into auth.users values ($1),($2)', [owner, other]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    await db.exec('set role authenticated');
    assert.ok((await db.query('select * from public.budget_app_wallet_accounts')).rows.length > 0, 'signed-in users retain wallet access');
    await db.query("select public.budget_app_create_project_wallet('Release test')");
    assert.ok((await db.query('select * from public.budget_app_get_account_balances()')).rows.length > 0);
    for (const table of tables.filter((table) => table.name !== 'budget_app_sessions')) {
      const count = (await db.query(`select count(*)::int as n from public."${table.name}" where owner_id=$1`, [other])).rows[0].n;
      assert.equal(count, 0, `${table.name} must isolate other owners`);
    }
    await db.exec('reset role');
    await db.exec(readFileSync('supabase/migrations/0008_restrict_anonymous_access.sql','utf8'));
    console.log(`PASS: ${setup} setup, all migrations, RLS, anonymous grants, owner isolation, bootstrap and wallet RPCs; hardening is rerunnable`);
  } finally { await db.close(); }
}
