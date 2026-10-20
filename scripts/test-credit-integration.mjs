// Isolated integration checks. Requires the same temporary PGlite dependency as test-credit.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

function moduleUrl(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [a, b] of Object.entries(replacements)) code = code.replaceAll(`'${a}'`, `'${b}'`);
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const financeUrl = moduleUrl('src/lib/finance.ts');
const creditUrl = moduleUrl('src/lib/credit.ts', { './finance': financeUrl });
const serverUrl = moduleUrl('src/lib/server/credit.ts', { '$lib/credit': creditUrl });
const replacements = { '$lib/credit': creditUrl, '$lib/server/credit': serverUrl, '@sveltejs/kit': import.meta.resolve('@sveltejs/kit') };
const routes = {};
for (const name of ['credit', 'dashboard', 'budgets', 'transactions', 'insights', 'wallets']) routes[name] = await import(moduleUrl(`src/routes/${name}/+page.server.ts`, replacements));
const { loadCreditCommitments } = await import(serverUrl);
const owner = '11111111-1111-4111-8111-111111111111';

// A small PostgREST-shaped adapter executes the loaders' queries against real PostgreSQL.
// All financial data, constraints, RLS, balance functions and write RPCs are real.
function supabaseAdapter(db) {
  const ident = (s) => { assert.match(s, /^[a-z_]+$/); return `"${s}"`; };
  return {
    auth: { getUser: async () => ({ data: { user: { id: owner, email: 'test@example.invalid' } }, error: null }) },
    rpc: async (name, args) => {
      try {
        if (name === 'budget_app_get_account_balances') return { data: (await db.query('select * from public.budget_app_get_account_balances()')).rows, error: null };
        assert.equal(name, 'budget_app_manage_credit');
        return { data: (await db.query('select public.budget_app_manage_credit($1,$2::jsonb) as id', [args.p_action, JSON.stringify(args.p_data)])).rows[0].id, error: null };
      } catch (error) { return { data: null, error: { message: error.message } }; }
    },
    from(table) {
      const conditions = [], params = [], orders = []; let projection = '', limit, offset = 0, exact = false;
      const param = (v) => { params.push(v); return `$${params.length}`; };
      const q = {
        select(p, options) { projection = p; exact = options?.count === 'exact'; return q; },
        eq(k, v) { conditions.push(`${ident(k)}=${param(v)}`); return q; },
        is(k, v) { assert.equal(v, null); conditions.push(`${ident(k)} is null`); return q; },
        gte(k, v) { conditions.push(`${ident(k)}>=${param(v)}`); return q; },
        lt(k, v) { conditions.push(`${ident(k)}<${param(v)}`); return q; },
        in(k, values) { conditions.push(`${ident(k)}=any(${param(values)}::uuid[])`); return q; },
        or(expression) {
          const matches = [...expression.matchAll(/([a-z_]+)\.in\.\(([^)]*)\)/g)];
          assert.ok(matches.length);
          conditions.push('(' + matches.map(([, k, ids]) => `${ident(k)}=any(${param(ids.split(','))}::uuid[])`).join(' or ') + ')'); return q;
        },
        order(k, options) { orders.push(`${ident(k)} ${options?.ascending === false ? 'desc' : 'asc'}`); return q; },
        limit(n) { limit = n; return q; },
        range(start, end) { offset = start; limit = end - start + 1; return q; },
        then(resolve, reject) {
          return (async () => {
            try {
              const base = `from public.${ident(table)}${conditions.length ? ' where ' + conditions.join(' and ') : ''}`;
              const count = exact ? (await db.query(`select count(*)::int as n ${base}`, params)).rows[0].n : null;
              let data = (await db.query(`select * ${base}${orders.length ? ' order by ' + orders.join(',') : ''}${limit !== undefined ? ' limit ' + Number(limit) : ''} offset ${offset}`, params)).rows;
              if (projection.includes('wallet_accounts:')) {
                const accounts = (await db.query('select * from public.budget_app_wallet_accounts')).rows;
                data = data.map((g) => ({ ...g, wallet_accounts: accounts.filter((a) => a.wallet_group_id === g.id) }));
              }
              return { data: JSON.parse(JSON.stringify(data, function (key, value) {
                return this[key] instanceof Date && /(_on|_date|period_start)$/.test(key) ? value.slice(0, 10) : value;
              })), error: null, count };
            } catch (error) { return { data: null, error: { message: error.message }, count: null }; }
          })().then(resolve, reject);
        }
      }; return q;
    }
  };
}

const db = new PGlite();
try {
  await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;`);
  for (const name of ['0001_initial_schema.sql', '0002_investments.sql', '0003_investment_opening_balances.sql', '0004_stock_purchase_workflows.sql', '0005_stock_brokerage_purchases.sql', '0006_credit.sql']) await db.exec(readFileSync('supabase/migrations/' + name, 'utf8').replace('create extension if not exists pgcrypto;', ''));
  await db.query('insert into auth.users values ($1)', [owner]);
  await db.query('update public.budget_app_wallet_accounts set opening_balance=1000 where owner_id=$1', [owner]);
  const accounts = (await db.query('select * from public.budget_app_wallet_accounts where owner_id=$1', [owner])).rows;
  const bank = accounts.find((a) => a.currency === 'USD' && a.channel === 'bank');
  const cash = accounts.find((a) => a.currency === 'USD' && a.channel === 'cash');
  const zig = accounts.find((a) => a.currency === 'ZIG' && a.channel === 'bank');
  const category = (await db.query('select id from public.budget_app_categories where owner_id=$1', [owner])).rows[0].id;
  const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const before = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  // Current budget targets let us check that only interest/fees count as spending.
  await db.query(`insert into public.budget_app_budget_targets(owner_id,wallet_group_id,currency,goal_kind,amount,period_start) values
    ($1,$2,'USD','spending_cap',100,$3),($1,$2,'USD','income_target',100,$3)`, [owner, bank.wallet_group_id, start]);
  const investment = (await db.query("insert into public.budget_app_investment_accounts(owner_id,name,kind,currency) values ($1,'Broker','stocks','USD') returning id", [owner])).rows[0].id;
  await db.query("insert into public.budget_app_investment_cash_movements(owner_id,investment_account_id,wallet_account_id,kind,amount,occurred_at) values ($1,$2,$3,'deposit',50,$4)", [owner, investment, bank.id, `${start}T12:00:00Z`]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]); await db.exec('set role authenticated');
  const supabase = supabaseAdapter(db), locals = { supabase };
  const rpc = async (action, data) => { const result = await supabase.rpc('budget_app_manage_credit', { p_action: action, p_data: data }); assert.equal(result.error, null); return result.data; };
  const external = await rpc('create', { name: 'Bank loan', kind: 'external', lender: 'Lender', receiving_account_id: bank.id, principal: '300', charges: '30', borrowed_on: before, due_on: end });
  await rpc('instalment', { credit_id: external, amount: '100', due_on: today });
  await rpc('repay', { credit_id: external, account_id: bank.id, principal: '100', charges: '10', category_id: category, occurred_on: start });
  const internal = await rpc('create', { name: 'Wallet borrowing', kind: 'internal', lending_account_id: cash.id, receiving_account_id: bank.id, principal: '200', charges: '0', borrowed_on: start, due_on: end });
  await rpc('repay', { credit_id: internal, account_id: bank.id, principal: '50', charges: '0', occurred_on: start });
  await rpc('create', { name: 'ZiG loan', kind: 'external', lender: 'Lender', receiving_account_id: zig.id, principal: '20', charges: '0', borrowed_on: start, due_on: end });
  const request = (route, query = '') => routes[route].load({ locals, url: new URL(`http://test.invalid/${route}${query}`) });
  const walletData = await request('wallets');
  assert.equal(walletData.loadError, null);
  assert.equal(walletData.balances[bank.id], '1290.00');
  assert.equal(walletData.balances[cash.id], '850.00');
  assert.equal(walletData.balances[zig.id], '1020.00');
  const dashboard = await request('dashboard');
  assert.equal(dashboard.errorMessage, null);
  assert.equal(dashboard.summary.USD.balance, '3140.00');
  assert.equal(dashboard.summary.ZIG.balance, '3020.00');
  assert.equal(dashboard.summary.USD.income, '0.00');
  assert.equal(dashboard.summary.USD.spending, '10.00');
  const budgets = await request('budgets');
  assert.equal(budgets.loadError, null);
  assert.equal(budgets.targets.find((t) => t.goal_kind === 'spending_cap').actual, '10.00');
  assert.equal(budgets.targets.find((t) => t.goal_kind === 'income_target').actual, '0.00');
  assert.deepEqual(dashboard.creditCommitments, budgets.creditCommitments);
  assert.equal(dashboard.creditCommitments.rows.find((c) => c.id === external).due, '220.00');
  const creditPage = await request('credit');
  assert.equal(creditPage.loadError, null);
  assert.equal(creditPage.credits.find((c) => c.id === external).outstanding, '220.00');
  assert.equal(creditPage.credits.find((c) => c.id === internal).outstanding, '150.00');
  const activity = await request('transactions', `?wallet=${bank.wallet_group_id}`);
  assert.equal(activity.loadError, null); assert.equal(activity.creditError, null);
  assert.equal(activity.creditMovements.length, 5);
  console.log('PASS: actual Credit, Wallets, Overview, Budgets and Transactions loaders agree; currencies and investment funding remain separate');

  const insights = await request('insights', `?wallet=${bank.wallet_group_id}:USD&from=${start}&to=${today}`);
  assert.equal(insights.loadError, null); assert.equal(insights.statement.error, '');
  assert.equal(insights.statement.opening, '3300.00', 'prior loan drawdown must enter opening balance');
  assert.equal(insights.statement.closing, '3140.00', 'statement must reconcile to wallet balance');
  assert.equal(insights.statement.rows.filter((r) => r.type.startsWith('Credit')).length, 1, 'same-group internal borrowing must net to zero');
  assert.equal(insights.statement.rows.find((r) => r.type === 'Credit repayment').debit, '100.00', 'interest must not be counted twice');
  const expenseStatement = await request('insights', `?wallet=${bank.wallet_group_id}:USD&from=${start}&to=${today}&activity=expense`);
  assert.equal(expenseStatement.statement.closing, '3140.00');
  assert.equal(expenseStatement.statement.rows.some((r) => r.type.startsWith('Credit')), false);
  console.log('PASS: Insights statement opening/closing balances reconcile; principal is excluded from expense filters; charges are counted once');

  const project = (await db.query("select public.budget_app_create_project_wallet('Project A') as id")).rows[0].id;
  const projectAccount = (await db.query("select id from public.budget_app_wallet_accounts where wallet_group_id=$1 and currency='USD'", [project])).rows[0].id;
  await db.query("insert into public.budget_app_transactions(owner_id,kind,account_id,destination_account_id,amount,destination_amount,occurred_at) values ($1,'transfer',$2,$3,200,200,$4)", [owner, cash.id, projectAccount, `${start}T12:00:00Z`]);
  const projectLoan = await rpc('create', { name: 'Personal from project', kind: 'internal', lending_account_id: projectAccount, receiving_account_id: bank.id, principal: '100', charges: '0', borrowed_on: start, due_on: end });
  await rpc('repay', { credit_id: projectLoan, account_id: bank.id, principal: '40', charges: '0', occurred_on: start });
  const personalStatement = await request('insights', `?wallet=${bank.wallet_group_id}:USD&from=${start}&to=${today}`);
  const projectStatement = await request('insights', `?wallet=${project}:USD&from=${start}&to=${today}`);
  assert.equal(personalStatement.statement.closing, '3000.00');
  assert.equal(projectStatement.statement.closing, '140.00');
  assert.equal(projectStatement.statement.rows.find((r) => r.type === 'Credit borrowing').debit, '100.00');
  assert.equal(projectStatement.statement.rows.find((r) => r.type === 'Credit repayment').credit, '40.00');
  const projectOverview = await request('dashboard');
  assert.equal(projectOverview.summary.USD.balance, '3140.00');
  assert.equal(projectOverview.summary.USD.income, '0.00');
  assert.equal(projectOverview.summary.USD.spending, '10.00');
  console.log('PASS: borrowing from a project wallet and partial reimbursement reconcile on both statements without changing overall cash or spending');

  // Test the actual pagination helper with more than one API page of repayments.
  const manyPayments = Array.from({ length: 1001 }, (_, n) => ({ id: String(n).padStart(4, '0'), credit_id: 'large', kind: 'repay', principal: '0.01', charges: '0' }));
  const fixtureLoan = { ...creditPage.credits[0], id: 'large', principal: '10.02', charges: '0', due_on: end };
  const fixtureTables = { budget_app_credits: [fixtureLoan], budget_app_credit_movements: manyPayments, budget_app_credit_instalments: [] };
  const fake = { from(table) { return { select() { return this; }, order() { return this; }, range(a, b) { return Promise.resolve({ data: fixtureTables[table].slice(a, b + 1), error: null }); } }; } };
  const fullHistory = await loadCreditCommitments(fake);
  assert.equal(fullHistory.error, null); assert.equal(fullHistory.rows[0].outstanding, '0.01');
  console.log('PASS: complete repayment histories are loaded past the 1,000-row API limit');

  const feedbackUrl = moduleUrl('src/lib/investments/feedback.ts', { 'svelte/store': import.meta.resolve('svelte/store') });
  const { investmentFeedback, handleInvestmentSubmit } = await import(feedbackUrl);
  const { get } = await import('svelte/store');
  let callback = handleInvestmentSubmit();
  assert.equal(get(investmentFeedback).state, 'pending');
  let refreshed = false;
  await callback({ result: { type: 'success', data: { message: 'Saved' } }, update: async () => { assert.equal(get(investmentFeedback).state, 'pending'); refreshed = true; } });
  assert.equal(refreshed, true); assert.equal(get(investmentFeedback).state, 'success');
  callback = handleInvestmentSubmit();
  await callback({ result: { type: 'failure', data: { message: 'Invalid payment' } }, update: async (options) => { assert.equal(options.reset, false); } });
  assert.equal(get(investmentFeedback).message, 'Invalid payment');
  callback = handleInvestmentSubmit();
  await callback({ result: { type: 'error' }, update: async () => { assert.fail('Network errors must not navigate away from the form'); } });
  assert.equal(get(investmentFeedback).state, 'error');
  callback = handleInvestmentSubmit();
  await callback({ result: { type: 'success', data: {} }, update: async () => { throw Error('Refresh failed'); } });
  assert.match(get(investmentFeedback).message, /were saved.*could not refresh/);
  callback = handleInvestmentSubmit();
  await callback({ result: { type: 'redirect', location: '/' }, update: async () => {} });
  assert.equal(get(investmentFeedback).state, 'error');
  assert.match(get(investmentFeedback).message, /Sign in again/);
  console.log('PASS: processing/success/error modal flow, failed form preservation and post-save refresh failure');
} finally { await db.close(); }
