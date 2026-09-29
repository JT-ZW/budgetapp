import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
function minor(value: string): bigint { const normalized = String(value).trim(); const negative = normalized.startsWith('-'); const [whole, fraction = ''] = normalized.replace(/^-/, '').split('.'); const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)); return negative ? -amount : amount; }
function decimal(value: bigint): string { const sign = value < 0n ? '-' : ''; const n = value < 0n ? -value : value; return `${sign}${n / 100n}.${String(n % 100n).padStart(2, '0')}`; }
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const { data: auth, error: authError } = await locals.supabase.auth.getUser(); if (authError || !auth.user) redirect(303, '/');
  const now = new Date(); const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const startString = start.toISOString(); const endString = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1)).toISOString();
  const [groupsResult, accountsResult, categoriesResult, txResult, balancesResult] = await Promise.all([
    locals.supabase.from('budget_app_wallet_groups').select('id,name,kind,archived_at'),
    locals.supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,archived_at'),
    locals.supabase.from('budget_app_categories').select('id,name,kind'),
    locals.supabase.from('budget_app_transactions').select('kind,account_id,amount,fee_amount,category_id,occurred_at').gte('occurred_at', startString).lt('occurred_at', endString).order('occurred_at'),
    locals.supabase.rpc('budget_app_get_account_balances')
  ]);
  const accounts = Object.fromEntries((accountsResult.data ?? []).map((a: any) => [a.id, a]));
  const groups = Object.fromEntries((groupsResult.data ?? []).map((g: any) => [g.id, g]));
  const categories = Object.fromEntries((categoriesResult.data ?? []).map((c: any) => [c.id, c]));
  const monthKeys = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1)); return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en', { month: 'short' }) }; });
  const monthly = new Map<string, { month: string; currency: string; income: bigint; spending: bigint }>();
  const categorySpend = new Map<string, bigint>(); const walletActivity = new Map<string, { group: string; currency: string; income: bigint; spending: bigint }>();
  for (const row of txResult.data ?? []) {
    const account = accounts[row.account_id]; if (!account) continue;
    const key = `${String(row.occurred_at).slice(0, 7)}:${account.currency}`;
    const entry = monthly.get(key) ?? { month: String(row.occurred_at).slice(0, 7), currency: account.currency, income: 0n, spending: 0n };
    if (row.kind === 'income') entry.income += minor(String(row.amount));
    if (row.kind === 'expense') entry.spending += minor(String(row.amount));
    if (row.kind === 'transfer') entry.spending += minor(String(row.fee_amount ?? '0'));
    monthly.set(key, entry);
    const walletKey = `${account.wallet_group_id}:${account.currency}`;
    const wallet = walletActivity.get(walletKey) ?? { group: groups[account.wallet_group_id]?.name ?? 'Wallet', currency: account.currency, income: 0n, spending: 0n };
    if (row.kind === 'income') wallet.income += minor(String(row.amount));
    if (row.kind === 'expense') wallet.spending += minor(String(row.amount));
    if (row.kind === 'transfer') wallet.spending += minor(String(row.fee_amount ?? '0'));
    walletActivity.set(walletKey, wallet);
    if (String(row.occurred_at).slice(0, 7) === currentMonth.toISOString().slice(0, 7) && (row.kind === 'expense' || row.kind === 'transfer')) {
      const amount = row.kind === 'expense' ? minor(String(row.amount)) : minor(String(row.fee_amount ?? '0'));
      const categoryName = categories[row.category_id]?.name ?? 'Uncategorised'; const catKey = `${account.currency}:${categoryName}`;
      categorySpend.set(catKey, (categorySpend.get(catKey) ?? 0n) + amount);
    }
  }
  const monthRows = monthKeys.map((m) => ({ ...m, USD: monthly.get(`${m.key}:USD`) ?? { income: 0n, spending: 0n }, ZIG: monthly.get(`${m.key}:ZIG`) ?? { income: 0n, spending: 0n } })).map((m: any) => ({ month: m.month, label: m.label, USD: { income: decimal(m.USD.income), spending: decimal(m.USD.spending) }, ZIG: { income: decimal(m.ZIG.income), spending: decimal(m.ZIG.spending) } }));
  const currentBalances = { USD: 0n, ZIG: 0n };
  const groupArchived = new Map<string, boolean>((groupsResult.data ?? []).map((group: any) => [group.id, Boolean(group.archived_at)]));
  const balancesByAccount = new Map<string, string>((balancesResult.data ?? []).map((row: any) => [row.account_id, String(row.balance)]));
  for (const account of accountsResult.data ?? []) {
    if (account.archived_at || groupArchived.get(account.wallet_group_id)) continue;
    const current = balancesByAccount.get(account.id);
    if (current != null) currentBalances[account.currency as 'USD' | 'ZIG'] += minor(current);
  }
  const hasMovement = monthRows.some((month) => ['USD', 'ZIG'].some((currency) => minor(month[currency as 'USD' | 'ZIG'].income) > 0n || minor(month[currency as 'USD' | 'ZIG'].spending) > 0n));
  const topCategories = ['USD', 'ZIG'].flatMap((currency) => [...categorySpend.entries()].filter(([key]) => key.startsWith(`${currency}:`)).map(([key, value]) => ({ currency, name: key.slice(currency.length + 1), amount: decimal(value) })).sort((a, b) => minor(b.amount) > minor(a.amount) ? 1 : minor(b.amount) < minor(a.amount) ? -1 : 0).slice(0, 5));
  const walletRows = [...walletActivity.values()].map((w) => ({ ...w, income: decimal(w.income), spending: decimal(w.spending) })).sort((a, b) => a.group.localeCompare(b.group) || a.currency.localeCompare(b.currency));
  return { months: monthRows, topCategories, wallets: walletRows, balances: { USD: decimal(currentBalances.USD), ZIG: decimal(currentBalances.ZIG) }, hasMovement, periodStart: startString.slice(0, 10), loadError: groupsResult.error?.message ?? accountsResult.error?.message ?? categoriesResult.error?.message ?? txResult.error?.message ?? balancesResult.error?.message ?? null };
};
