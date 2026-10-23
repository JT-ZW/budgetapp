// Verify the real dashboard loader with an isolated ledger, no live connections.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const asModule = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
let source = ts.transpileModule(readFileSync('src/routes/dashboard/+page.server.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText;
source = source.replaceAll("'@sveltejs/kit'", `'${import.meta.resolve('@sveltejs/kit')}'`)
  .replaceAll("'$lib/server/credit'", `'${asModule('export async function loadCreditCommitments() { return {rows:[], error:null}; }')}'`);
const { load } = await import(asModule(source));
const accounts = [{ id: 'usd', currency: 'USD', opening_balance: '0.00' }, { id: 'zig', currency: 'ZIG', opening_balance: '0.00' }];
const categories = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, name: `Category ${i}` }));
const transactions = [
  { account_id: 'usd', kind: 'expense', amount: '0.10', category_id: 'c0' },
  { account_id: 'usd', kind: 'expense', amount: '0.20', category_id: 'c0' },
  { account_id: 'usd', kind: 'income', amount: '9999.00', category_id: 'c1' },
  { account_id: 'usd', kind: 'transfer', amount: '1000.00', fee_amount: '0.05' },
  { account_id: 'zig', kind: 'expense', amount: '5000.00', category_id: 'c0' },
  { account_id: 'missing', kind: 'expense', amount: '100.00', category_id: 'c0' }
];
function database(rows, broken = false) {
  return {
    auth: { getUser: async () => ({ data: { user: { email: 'test@example.test' } } }) },
    rpc: async () => ({ data: [], error: null }),
    from(table) {
      let data = table === 'budget_app_wallet_groups' ? [{ id: 'group', kind: 'personal', name: 'Personal', wallet_accounts: accounts }]
        : table === 'budget_app_categories' ? categories
        : table === 'budget_app_transactions' ? rows : [];
      const builder = {
        select() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; }, limit() { return this; },
        then(resolve) { resolve({ data, error: broken ? { message: 'Unavailable' } : null }); }
      };
      return builder;
    }
  };
}
let result = await load({ locals: { supabase: database(transactions) } });
assert.equal(result.summary.USD.spending, '0.35');
assert.deepEqual(result.spendingCategories.USD, [{ name: 'Category 0', amount: '0.30' }, { name: 'Transfer fees', amount: '0.05' }]);
assert.deepEqual(result.spendingCategories.ZIG, [{ name: 'Category 0', amount: '5000.00' }]);
const many = categories.map((category, index) => ({ account_id: 'usd', kind: 'expense', amount: `${index + 1}.00`, category_id: category.id }));
result = await load({ locals: { supabase: database(many) } });
assert.equal(result.spendingCategories.USD.length, 5);
assert.deepEqual(result.spendingCategories.USD.at(-1), { name: 'Other', amount: '3.00' });
assert.equal(result.spendingCategories.USD[0].amount, '6.00');
result = await load({ locals: { supabase: database([]) } });
assert.deepEqual(result.spendingCategories.USD, []);
result = await load({ locals: { supabase: database(transactions, true) } });
assert.deepEqual(result.spendingCategories, { USD: [], ZIG: [] });
console.log('PASS: exact spending totals, fees only, currency isolation, category ranking, empty and error states');
