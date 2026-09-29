import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
function minor(value: string): bigint { const normalized = String(value).trim(); const negative = normalized.startsWith('-'); const [whole, fraction = ''] = normalized.replace(/^-/, '').split('.'); const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)); return negative ? -amount : amount; }
function decimal(value: bigint): string { const sign = value < 0n ? '-' : ''; const amount = value < 0n ? -value : value; return `${sign}${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`; }
function periodRange(type: string, date: Date) {
  const year = date.getUTCFullYear(); const month = date.getUTCMonth();
  const start = type === 'year' ? new Date(Date.UTC(year, 0, 1)) : type === 'quarter' ? new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)) : type === 'week' ? new Date(Date.UTC(year, month, date.getUTCDate() - ((date.getUTCDay() + 6) % 7))) : new Date(Date.UTC(year, month, 1));
  const end = type === 'year' ? new Date(Date.UTC(year + 1, 0, 1)) : type === 'quarter' ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1)) : type === 'week' ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7)) : new Date(Date.UTC(year, month + 1, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const { data: auth, error: authError } = await locals.supabase.auth.getUser();
  if (authError || !auth.user) redirect(303, '/');
  const now = new Date();
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const periodStart = startDate.toISOString().slice(0, 10);
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
  const nextYearStart = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString();
  const [groupsResult, balancesResult, monthResult, recentResult, budgetsResult, budgetTransactionsResult, categoriesResult] = await Promise.all([
    locals.supabase.from('budget_app_wallet_groups').select('id,name,kind,archived_at,created_at,wallet_accounts:budget_app_wallet_accounts(id,currency,channel,opening_balance,archived_at)'),
    locals.supabase.rpc('budget_app_get_account_balances'),
    locals.supabase.from('budget_app_transactions').select('id,kind,account_id,destination_account_id,amount,destination_amount,fee_amount,category_id,description,occurred_at').gte('occurred_at', startDate.toISOString()).lt('occurred_at', nextDate.toISOString()),
    locals.supabase.from('budget_app_transactions').select('id,kind,account_id,destination_account_id,amount,destination_amount,fee_amount,category_id,description,occurred_at').order('occurred_at', { ascending: false }).limit(6),
    locals.supabase.from('budget_app_budget_targets').select('id,wallet_group_id,currency,goal_kind,category_id,amount,period_start,period_type'),
    locals.supabase.from('budget_app_transactions').select('kind,account_id,destination_account_id,amount,destination_amount,fee_amount,category_id,occurred_at').gte('occurred_at', yearStart).lt('occurred_at', nextYearStart),
    locals.supabase.from('budget_app_categories').select('id,name,kind')
  ]);
  const allGroups = groupsResult.data ?? [];
  const groups = allGroups.filter((group: any) => !group.archived_at);
  const accounts = new Map<string, any>();
  const groupNames = new Map<string, string>();
  for (const group of allGroups as any[]) {
    groupNames.set(group.id, group.name);
    for (const account of group.wallet_accounts ?? []) {
      accounts.set(account.id, { ...account, group_id: group.id, group_name: group.name, group_kind: group.kind, group_archived: Boolean(group.archived_at) });
    }
  }
  const balanceRows = new Map<string, string>((balancesResult.data ?? []).map((row: { account_id: string; balance: string | number }) => [row.account_id, String(row.balance)]));
  const summary = {
    USD: { balance: 0n, income: 0n, spending: 0n },
    ZIG: { balance: 0n, income: 0n, spending: 0n }
  };
  for (const [id, account] of accounts) {
    if (account.group_archived || account.archived_at) continue;
    const item = summary[account.currency as 'USD' | 'ZIG'];
    item.balance += minor(balanceRows.get(id) ?? String(account.opening_balance));
  }
  const monthTransactions = monthResult.data ?? [];
  for (const row of monthTransactions as any[]) {
    const account = accounts.get(row.account_id);
    if (!account) continue;
    const item = summary[account.currency as 'USD' | 'ZIG'];
    if (row.kind === 'income') item.income += minor(String(row.amount));
    if (row.kind === 'expense') item.spending += minor(String(row.amount));
    if (row.kind === 'transfer') item.spending += minor(String(row.fee_amount ?? '0'));
  }
  const categoryNames = new Map<string, string>((categoriesResult.data ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
  const budgetHighlights = (budgetsResult.data ?? []).flatMap((target: any) => {
    const periodType = target.period_type ?? 'month';
    const range = periodRange(periodType, now);
    if (target.period_start !== range.start) return [];
    let actual = 0n;
    for (const tx of budgetTransactionsResult.data ?? []) {
      const occurred = String(tx.occurred_at);
      if (occurred < `${range.start}T00:00:00` || occurred >= `${range.end}T00:00:00`) continue;
      const account = accounts.get(tx.account_id); const destination = accounts.get(tx.destination_account_id);
      const sourceMatches = account?.group_id === target.wallet_group_id && account.currency === target.currency;
      const destinationMatches = destination?.group_id === target.wallet_group_id && destination.currency === target.currency;
      if (target.goal_kind === 'savings_target') {
        if (sourceMatches) {
          if (tx.kind === 'income') actual += minor(String(tx.amount));
          if (tx.kind === 'expense') actual -= minor(String(tx.amount));
          if (tx.kind === 'transfer') actual -= minor(String(tx.amount)) + minor(String(tx.fee_amount ?? '0'));
        }
        if (tx.kind === 'transfer' && destinationMatches) actual += minor(String(tx.destination_amount ?? '0'));
        continue;
      }
      if (!sourceMatches) continue;
      if (target.category_id && tx.category_id !== target.category_id) continue;
      if (target.goal_kind === 'income_target' && tx.kind === 'income') actual += minor(String(tx.amount));
      if (target.goal_kind === 'spending_cap' && tx.kind === 'expense') actual += minor(String(tx.amount));
      if (target.goal_kind === 'spending_cap' && tx.kind === 'transfer') actual += minor(String(tx.fee_amount ?? '0'));
    }
    return [{ ...target, period_type: periodType, group_name: groupNames.get(target.wallet_group_id) ?? 'Wallet', category_name: target.category_id ? categoryNames.get(target.category_id) ?? null : null, actual: decimal(actual) }];
  }).sort((a: any, b: any) => {
    const ratioA = Number(a.actual) / Number(a.amount); const ratioB = Number(b.actual) / Number(b.amount);
    return ratioB - ratioA;
  }).slice(0, 4);
  const recentActivity = (recentResult.data ?? []).map((row: any) => {
    const source = accounts.get(row.account_id); const destination = accounts.get(row.destination_account_id);
    return { ...row, source_currency: source?.currency ?? 'USD', source_wallet: source?.group_name ?? 'Wallet', source_channel: source?.channel ?? null, destination_currency: destination?.currency ?? source?.currency ?? 'USD', destination_wallet: destination?.group_name ?? 'Wallet', category_name: categoryNames.get(row.category_id) ?? null };
  });
  const databaseReady = !groupsResult.error && !balancesResult.error && !monthResult.error && !recentResult.error && !budgetsResult.error && !budgetTransactionsResult.error && !categoriesResult.error;
  return {
    email: auth.user.email ?? '', groups: databaseReady ? groups : [],
    balances: Object.fromEntries(balanceRows), summary: Object.fromEntries(Object.entries(summary).map(([currency, values]) => [currency, { balance: decimal(values.balance), income: decimal(values.income), spending: decimal(values.spending), net: decimal(values.income - values.spending) }])),
    budgetHighlights: databaseReady ? budgetHighlights : [], recentActivity: databaseReady ? recentActivity : [], databaseReady,
    monthLabel: startDate.toLocaleDateString('en', { month: 'long', year: 'numeric' }),
    errorMessage: [groupsResult, balancesResult, monthResult, recentResult, budgetsResult, budgetTransactionsResult, categoriesResult].find((result) => result.error)?.error?.message ?? null
  };
};
