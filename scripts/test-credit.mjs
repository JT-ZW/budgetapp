// Run with: npm install --no-save --package-lock=false @electric-sql/pglite
//           node scripts/test-credit.mjs
// Uses an isolated, in-memory PostgreSQL database; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function moduleUrl(path, replacements = {}) {
  let source = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [name, url] of Object.entries(replacements)) source = source.replaceAll(`'${name}'`, `'${url}'`);
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}
const financeUrl = moduleUrl('src/lib/finance.ts');
const { creditProgress } = await import(moduleUrl('src/lib/credit.ts', { './finance': financeUrl }));
const credit = { id: 'loan', name: 'Loan', kind: 'external', currency: 'USD', principal: '300', charges: '30', due_on: '2026-12-31', borrowed_on: '2026-09-01' };
const schedule = [
  { id: 'a', credit_id: 'loan', amount: '100', due_on: '2026-10-01' },
  { id: 'b', credit_id: 'loan', amount: '100', due_on: '2026-11-01' }
];
const partial = [{ credit_id: 'loan', kind: 'repay', principal: '120', charges: '10' }];
let progress = creditProgress(credit, partial, schedule, '2026-10-19');
assert.equal(progress.outstanding, '200.00');
assert.equal(progress.schedule[0].status, 'Paid');
assert.equal(progress.schedule[1].paid, '30.00');
assert.equal(progress.schedule[1].remaining, '70.00');
assert.equal(progress.unplanned, '130.00');
assert.equal(progress.unscheduledOutstanding, '130.00');
assert.equal(creditProgress(credit, [{ credit_id: 'loan', kind: 'repay', principal: '250', charges: '0' }], schedule, '2026-10-19').unscheduledOutstanding, '80.00');
assert.equal(progress.overdue, '0.00');
progress = creditProgress(credit, [], schedule, '2026-10-19');
assert.equal(progress.overdue, '100.00');
assert.equal(progress.status, 'Overdue');
assert.equal(creditProgress(credit, partial, schedule, '2027-01-01').overdue, '200.00');
assert.equal(creditProgress(credit, [{ credit_id: 'loan', kind: 'repay', principal: '300', charges: '30' }], schedule, '2026-10-19').status, 'Repaid');
const cents = creditProgress({ ...credit, principal: '0.30', charges: '0' }, [{ credit_id: 'loan', kind: 'repay', principal: '0.10', charges: '0' }], [], '2026-10-19');
assert.equal(cents.outstanding, '0.20');
console.log('PASS: repayment allocation, partial and early payments, overdue totals, exact cents');

if (process.argv.includes('--math-only')) process.exit(0);
const { PGlite } = await import('@electric-sql/pglite');

const db = new PGlite();
try {
  await db.exec(`
    create role authenticated; create role anon; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated,anon;
  `);
  for (const file of ['0001_initial_schema.sql', '0002_investments.sql', '0003_investment_opening_balances.sql', '0004_stock_purchase_workflows.sql', '0005_stock_brokerage_purchases.sql', '0006_credit.sql', '0007_app_sessions.sql', '0008_restrict_anonymous_access.sql', '0009_lending.sql', '0010_custom_budget_periods.sql']) {
    // PGlite includes gen_random_uuid in core; the extension itself is unnecessary.
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8').replace('create extension if not exists pgcrypto;', ''));
  }
  console.log('PASS: all migrations apply to PostgreSQL');
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users(id) values ($1),($2)', [owner, other]);
  const accounts = (await db.query("select id,currency,channel from public.budget_app_wallet_accounts where owner_id=$1", [owner])).rows;
  const bank = accounts.find((a) => a.currency === 'USD' && a.channel === 'bank').id;
  const cash = accounts.find((a) => a.currency === 'USD' && a.channel === 'cash').id;
  const zig = accounts.find((a) => a.currency === 'ZIG').id;
  const category = (await db.query('select id from public.budget_app_categories where owner_id=$1', [owner])).rows[0].id;
  await db.query('update public.budget_app_wallet_accounts set opening_balance=1000 where owner_id=$1', [owner]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await db.exec('set role authenticated');
  const rpc = async (action, data) => (await db.query('select public.budget_app_manage_credit($1,$2::jsonb) as id', [action, JSON.stringify(data)])).rows[0].id;
  const balances = async () => Object.fromEntries((await db.query('select * from public.budget_app_get_account_balances()')).rows.map((r) => [r.account_id, r.balance]));
  const initial = { name: 'External', kind: 'external', lender: 'Test lender', receiving_account_id: bank, principal: '300', charges: '30', borrowed_on: '2026-01-01', due_on: '2027-01-01' };
  const external = await rpc('create', initial);
  assert.equal((await balances())[bank], '1300.00');
  assert.equal((await db.query("select count(*)::int as count from public.budget_app_transactions where kind='income'")).rows[0].count, 0);
  await rpc('instalment', { credit_id: external, due_on: '2026-12-01', amount: '100' });
  assert.equal((await balances())[bank], '1300.00', 'plans must not move cash');
  await rpc('repay', { credit_id: external, account_id: bank, principal: '100', charges: '10', category_id: category, occurred_on: '2026-01-02' });
  assert.equal((await balances())[bank], '1190.00');
  assert.equal((await db.query('select sum(amount)::text as amount from public.budget_app_transactions')).rows[0].amount, '10.00');
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: bank, principal: '201', charges: '0', occurred_on: '2026-01-02' }), /exceeds/);
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: bank, principal: '10', charges: '21', category_id: category, occurred_on: '2026-01-02' }), /exceeds/);
  const beforeFailed = await balances();
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: bank, principal: '10', charges: '1', category_id: '', occurred_on: '2026-01-02' }));
  assert.deepEqual(await balances(), beforeFailed, 'failed payment must be atomic');
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: zig, principal: '10', charges: '0', occurred_on: '2026-01-02' }), /currency/);
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: bank, principal: '10', charges: '0', occurred_on: '2099-01-01' }), /date/);
  await assert.rejects(() => rpc('create', { ...initial, principal: '1.001' }), /decimal/);
  await assert.rejects(() => rpc('instalment', { credit_id: external, due_on: '2026-12-01', amount: '231' }), /exceed/);
  await assert.rejects(() => rpc('instalment', { credit_id: external, due_on: '2027-02-01', amount: '1' }), /date/);
  await assert.rejects(() => rpc('dueDate', { credit_id: external, due_on: '2026-11-01' }), /before/);
  const instalment = (await db.query('select id from public.budget_app_credit_instalments')).rows[0].id;
  await rpc('removeInstalment', { credit_id: external, instalment_id: instalment });
  assert.deepEqual(await balances(), beforeFailed, 'schedule removal must not change payments');
  await assert.rejects(() => db.query("update public.budget_app_transactions set amount=1 where description like 'Credit interest%'"), /cannot be changed/);
  await assert.rejects(() => db.query("delete from public.budget_app_transactions where description like 'Credit interest%'"), /cannot be changed/);
  // Ordinary transaction editing still works after adding the protection trigger.
  const ordinary = (await db.query("insert into public.budget_app_transactions(owner_id,kind,account_id,amount,category_id) values ($1,'expense',$2,1,$3) returning id", [owner, bank, category])).rows[0].id;
  await db.query('update public.budget_app_transactions set amount=2 where id=$1', [ordinary]);
  assert.equal((await db.query('select amount from public.budget_app_transactions where id=$1', [ordinary])).rows[0].amount, '2.00');
  await db.query('delete from public.budget_app_transactions where id=$1', [ordinary]);
  console.log('PASS: external loans, cash balances, expense classification, atomic failures, schedule validation');
  const internal = await rpc('create', { ...initial, kind: 'internal', lending_account_id: cash, charges: '0' });
  assert.equal((await balances())[bank], '1490.00');
  assert.equal((await balances())[cash], '700.00');
  await rpc('repay', { credit_id: internal, account_id: bank, principal: '50', charges: '0', occurred_on: '2026-01-02' });
  assert.equal((await balances())[bank], '1440.00');
  assert.equal((await balances())[cash], '750.00');
  await assert.rejects(() => rpc('repay', { credit_id: internal, account_id: cash, principal: '10', charges: '0', occurred_on: '2026-01-02' }), /lending wallet/);
  await assert.rejects(() => rpc('create', { ...initial, kind: 'internal', lending_account_id: zig, charges: '0' }), /currency/);
  console.log('PASS: internal borrowing and reimbursements conserve total cash');
  await rpc('repay', { credit_id: external, account_id: bank, principal: '200', charges: '20', category_id: category, occurred_on: '2026-01-02' });
  const repaidCredit = (await db.query('select * from public.budget_app_credits where id=$1', [external])).rows[0];
  const repayments = (await db.query("select * from public.budget_app_credit_movements where credit_id=$1 and kind='repay'", [external])).rows;
  const completed = creditProgress(repaidCredit, repayments, [], '2026-10-19');
  assert.equal(completed.status, 'Repaid'); assert.equal(completed.outstanding, '0.00'); assert.equal(completed.nextDue, null);
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: bank, principal: '0.01', charges: '0', occurred_on: '2026-01-02' }), /exceeds/);
  await rpc('instalment', { credit_id: internal, due_on: '2026-12-01', amount: '100' });
  await assert.rejects(() => rpc('repay', { credit_id: internal, account_id: bank, principal: '0', charges: '0', occurred_on: '2026-01-02' }), /positive/);
  await assert.rejects(() => rpc('repay', { credit_id: internal, account_id: bank, principal: '-1', charges: '0', occurred_on: '2026-01-02' }));
  console.log('PASS: full settlement, repaid status, zero outstanding and rejection of further repayments');
  await assert.rejects(() => db.query('update public.budget_app_credits set principal=1'), /permission denied/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [other]);
  assert.equal((await db.query('select * from public.budget_app_credits')).rows.length, 0);
  assert.equal((await db.query('select * from public.budget_app_credit_movements')).rows.length, 0);
  assert.equal((await db.query('select * from public.budget_app_credit_instalments')).rows.length, 0);
  await assert.rejects(() => rpc('repay', { credit_id: external, account_id: bank, principal: '1', charges: '0', occurred_on: '2026-01-02' }), /not found/);
  await assert.rejects(() => rpc('create', initial), /active wallet/);
  await db.exec('set role anon');
  await assert.rejects(() => rpc('create', initial), /permission denied/);
  console.log('PASS: owner isolation, RPC authorization, direct-write protection');
} finally { await db.close(); }
