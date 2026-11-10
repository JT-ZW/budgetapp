import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { checkProjectViews } from './test-project-views.mjs';

function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [name, url] of Object.entries(replacements)) code = code.replaceAll(`'${name}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const financeUrl = moduleUrl('src/lib/finance.ts');
const creditUrl = moduleUrl('src/lib/credit.ts', { './finance': financeUrl });
const projectUrl = moduleUrl('src/lib/projects.ts', { '$lib/finance': financeUrl });
const { loadProjectWorkspace, loadProjectDetail } = await import(moduleUrl('src/lib/server/projects.ts', {
  '@sveltejs/kit': import.meta.resolve('@sveltejs/kit'), '$lib/projects': projectUrl, '$lib/credit': creditUrl,
  '$lib/server/credit': moduleUrl('src/lib/server/credit.ts', { '$lib/credit': creditUrl }),
  '$lib/server/pagination': moduleUrl('src/lib/server/pagination.ts')
}));

const db = new PGlite();
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;`);
  for (const file of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync('supabase/migrations/' + file, 'utf8').replaceAll('create extension if not exists pgcrypto;', ''));
  await db.query('insert into auth.users values ($1),($2)', [owner, other]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const projectWallet = (await db.query("select public.budget_app_create_project_wallet('BeVisioneers') as id")).rows[0].id;
  const accounts = (await db.query('select * from public.budget_app_wallet_accounts')).rows;
  const usd = accounts.find((a) => a.wallet_group_id === projectWallet && a.currency === 'USD');
  const zig = accounts.find((a) => a.wallet_group_id === projectWallet && a.currency === 'ZIG');
  const cash = accounts.find((a) => a.channel === 'cash' && a.currency === 'USD');
  await db.query('update public.budget_app_wallet_accounts set opening_balance=100 where id=$1', [usd.id]);
  await db.query('update public.budget_app_wallet_accounts set opening_balance=1000 where id=$1', [cash.id]);
  const expense = (await db.query("select id from public.budget_app_categories where kind='expense' limit 1")).rows[0].id;
  const income = (await db.query("insert into public.budget_app_categories(owner_id,name,kind) values ($1,'Project sales','income') returning id", [owner])).rows[0].id;
  const today = (await db.query("select ((now() at time zone 'Africa/Harare')::date)::text as day")).rows[0].day;
  const oldDay = (await db.query("select (((now() at time zone 'Africa/Harare')::date)-1)::text as day")).rows[0].day;
  const transaction = async (kind, amount, description) => (await db.query(`insert into public.budget_app_transactions(owner_id,kind,account_id,amount,category_id,description,occurred_at)
    values ($1,$2,$3,$4,$5,$6,($7::date+time '12:00') at time zone 'UTC') returning id`, [owner, kind, usd.id, amount, kind === 'income' ? income : expense, description, oldDay])).rows[0].id;
  const equipment = await transaction('expense', '20', 'Equipment'), operations = await transaction('expense', '7', 'Transport'), sales = await transaction('income', '30', 'Sales');
  const balance = async (id) => (await db.query('select balance::text from public.budget_app_get_account_balances() where account_id=$1', [id])).rows[0].balance;
  const rpc = async (action, data) => (await db.query('select public.budget_app_manage_project($1,$2::jsonb) as id', [action, JSON.stringify(data)])).rows[0].id;
  const create = { name: 'BeVisioneers garden', wallet_group_id: projectWallet, request_id: randomUUID() };
  const project = await rpc('create', create);
  assert.equal(await rpc('create', create), project);
  assert.equal(await balance(usd.id), '103.00', 'linking a wallet creates no cash');
  assert.equal((await db.query("select amount::text from public.budget_app_project_funding where project_id=$1 and currency='USD' and kind='opening'", [project])).rows[0].amount, '103.00');
  await assert.rejects(rpc('create', { ...create, request_id: randomUUID() }), /unique/);
  await assert.rejects(rpc('create', { ...create, wallet_group_id: cash.wallet_group_id, request_id: randomUUID() }), /Personal stays separate/);
  const base = { project_id: project, account_id: usd.id, amount: '5', occurred_on: today, description: 'Materials', request_id: randomUUID() };
  await assert.rejects(rpc('record', { ...base, classification: 'opex', category_id: expense }), /Finish setup/);
  await rpc('classify', { project_id: project, entries: [{ transaction_id: equipment, classification: 'capex' }, { transaction_id: operations, classification: 'opex' }, { transaction_id: sales, classification: 'revenue' }] });
  await rpc('classify', { project_id: project, entries: [{ transaction_id: equipment, classification: 'capex' }] });
  assert.equal((await db.query('select count(*)::int as n from public.budget_app_project_entries where project_id=$1', [project])).rows[0].n, 3);
  await assert.rejects(rpc('classify', { project_id: project, entries: [{ transaction_id: sales, classification: 'opex' }] }), /Classify income/);
  const manual = { ...base, occurred_on: oldDay, classification: 'opex' };
  const historical = await rpc('historical', manual);
  assert.equal(await rpc('historical', manual), historical);
  assert.equal(await balance(usd.id), '103.00', 'imports and manual opening history never change cash');
  await assert.rejects(db.query("update public.budget_app_transactions set amount=99 where id=$1", [equipment]), /linked to project/);
  await rpc('finish_setup', { project_id: project });
  const contribution = { ...base, amount: '40', source_account_id: cash.id, kind: 'contribution', request_id: randomUUID() };
  const receipt = await rpc('fund', contribution);
  assert.equal(await rpc('fund', contribution), receipt);
  assert.equal(await balance(usd.id), '143.00');
  assert.equal(await balance(cash.id), '960.00');
  await assert.rejects(rpc('fund', { ...contribution, source_account_id: zig.id, request_id: randomUUID() }), /another active wallet/);
  await assert.rejects(rpc('fund', { ...contribution, amount: '9999', request_id: randomUUID() }), /exceeds/);
  const loanReceipt = await rpc('fund', { ...contribution, amount: '60', kind: 'loan', due_on: today, request_id: randomUUID() });
  const credit = (await db.query('select credit_id from public.budget_app_project_funding where id=$1', [loanReceipt])).rows[0].credit_id;
  assert.equal(await balance(usd.id), '203.00');
  assert.equal(await balance(cash.id), '900.00');
  const repayment = { ...base, credit_id: credit, amount: '10', request_id: randomUUID() };
  const payment = await rpc('repay', repayment);
  assert.equal(await rpc('repay', repayment), payment);
  assert.equal(await balance(usd.id), '193.00');
  assert.equal(await balance(cash.id), '910.00');
  const grant = await rpc('fund', { ...base, kind: 'grant', category_id: income, request_id: randomUUID() });
  assert.equal(await balance(usd.id), '198.00');
  const grantTransaction = (await db.query('select transaction_id from public.budget_app_project_funding where id=$1', [grant])).rows[0].transaction_id;
  await assert.rejects(rpc('classify', { project_id: project, entries: [{ transaction_id: grantTransaction, classification: 'revenue' }] }), /Funding cannot/);
  const daily = { ...base, amount: '3', classification: 'opex', category_id: expense, request_id: randomUUID() };
  const dailyId = await rpc('record', daily);
  assert.equal(await rpc('record', daily), dailyId);
  assert.equal(await balance(usd.id), '195.00');
  const entry = (await db.query('select transaction_id from public.budget_app_project_entries where id=$1', [dailyId])).rows[0];
  assert.ok(entry.transaction_id);
  await rpc('remove_entry', { project_id: project, entry_id: historical });
  assert.equal(await balance(usd.id), '195.00');
  await assert.rejects(rpc('record', { ...daily, occurred_on: '2026-02-30', request_id: randomUUID() }), /date/);
  await assert.rejects(db.query("insert into public.budget_app_projects(owner_id,name,wallet_group_id,request_id) values ($1,'Bypass',$2,$3)", [owner, projectWallet, randomUUID()]), /permission/);
  console.log('PASS: setup snapshots, exclusive links, selective classification, history-only entries, exact cash, contributions, grants, loans, repayments and retry protection');
  const pastGrant = await transaction('income', '1', 'Existing grant receipt');
  await rpc('classify', { project_id: project, entries: [{ transaction_id: pastGrant, classification: 'funding' }] });
  await rpc('classify', { project_id: project, entries: [{ transaction_id: pastGrant, classification: 'funding' }] });
  const importedFunding = (await db.query('select id from public.budget_app_project_funding where transaction_id=$1', [pastGrant])).rows[0].id;
  await rpc('unclassify_funding', { project_id: project, funding_id: importedFunding });
  await rpc('classify', { project_id: project, entries: [{ transaction_id: pastGrant, classification: 'funding' }] });
  assert.equal(await balance(usd.id), '196.00', 'classifying an existing grant does not create another deposit');
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name) => { assert.equal(name, 'budget_app_get_account_balances'); return { data: (await db.query('select * from public.budget_app_get_account_balances()')).rows, error: null }; },
    from(table) {
      assert.match(table, /^[a-z_]+$/);
      const where = [], params = [], order = []; let start = 0, end = 999;
      const ident = (key) => { assert.match(key, /^[a-z_]+$/); return `"${key}"`; };
      const q = { select() { return this; }, order(key, options) { order.push(`${ident(key)} ${options?.ascending === false ? 'desc' : 'asc'}`); return this; }, range(a, b) { start = a; end = b; return this; },
        in(key, values) { params.push(values); where.push(`${ident(key)}::text=any($${params.length}::text[])`); return this; },
        then(resolve, reject) { return (async () => { try {
          const rows = (await db.query(`select * from public.${table}${where.length ? ' where ' + where.join(' and ') : ''}${order.length ? ' order by ' + order.join(',') : ''} limit ${end - start + 1} offset ${start}`, params)).rows;
          const data = JSON.parse(JSON.stringify(rows, function (key, value) { return this[key] instanceof Date && /_on$/.test(key) ? value.slice(0, 10) : value; }));
          return { data, error: null };
        } catch (error) { return { data: null, error: { message: error.message } }; } })().then(resolve, reject); }
      }; return q;
    }
  };
  const workspace = await loadProjectWorkspace({ supabase });
  assert.equal(workspace.loadError, null);
  const summary = workspace.projects.find((p) => p.id === project).totals.find((t) => t.currency === 'USD');
  assert.equal(summary.cash, '196.00'); assert.equal(summary.capex, '20.00'); assert.equal(summary.opex, '10.00'); assert.equal(summary.revenue, '30.00'); assert.equal(summary.operatingSurplus, '20.00');
  assert.equal(summary.opening, '103.00'); assert.equal(summary.contributions, '40.00'); assert.equal(summary.grants, '6.00'); assert.equal(summary.loansReceived, '60.00');
  const detail = await loadProjectDetail({ supabase }, project, new URL('http://test.invalid/projects/' + project));
  assert.equal(detail.loadError, null); assert.equal(detail.unclassifiedCount, 0); assert.equal(detail.loans[0].outstanding, '50.00');
  assert.equal(detail.entries.filter((e) => e.transaction_id === equipment).length, 1);
  await checkProjectViews(workspace, detail);
  console.log('PASS: actual project loaders reconcile cash, separate funding from revenue, classify old grants, and show live credit balances');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  assert.equal((await db.query('select * from public.budget_app_projects')).rows.length, 0);
  assert.equal((await db.query('select * from public.budget_app_project_entries')).rows.length, 0);
  await assert.rejects(rpc('finish_setup', { project_id: project }), /not found/);
  await db.exec('reset role; set role anon');
  await assert.rejects(rpc('finish_setup', { project_id: project }), /permission/);
  console.log('PASS: project owner isolation, direct-write protection, anonymous rejection and malformed date rejection');
} finally { await db.close(); }
