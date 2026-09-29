import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

type PeriodType = 'week' | 'month' | 'quarter' | 'year';
const periods: PeriodType[] = ['week', 'month', 'quarter', 'year'];
function minor(value: string): bigint { const [whole, fraction = ''] = String(value).split('.'); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)); }
function decimal(value: bigint): string { const sign = value < 0n ? '-' : ''; const n = value < 0n ? -value : value; return `${sign}${n / 100n}.${String(n % 100n).padStart(2, '0')}`; }
function money(value: string): string { const s = value.trim(); if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(s)) throw new Error('Enter a valid positive amount with up to two decimal places.'); const [w, f = ''] = s.split('.'); const n = BigInt(w) * 100n + BigInt(f.padEnd(2, '0')); if (n <= 0n) throw new Error('The target must be greater than zero.'); return `${w}.${f.padEnd(2, '0')}`; }
function str(form: FormData, name: string) { return String(form.get(name) ?? '').trim(); }
function periodRange(type: PeriodType, date = new Date()) {
  const year = date.getUTCFullYear(); const month = date.getUTCMonth();
  const start = type === 'year' ? new Date(Date.UTC(year, 0, 1))
    : type === 'quarter' ? new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1))
      : type === 'month' ? new Date(Date.UTC(year, month, 1))
        : new Date(Date.UTC(year, month, date.getUTCDate() - ((date.getUTCDay() + 6) % 7)));
  const end = type === 'year' ? new Date(Date.UTC(year + 1, 0, 1))
    : type === 'quarter' ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1))
      : type === 'month' ? new Date(Date.UTC(year, month + 1, 1))
        : new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 7));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function isPeriod(value: string): value is PeriodType { return periods.includes(value as PeriodType); }

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const { data: auth, error: authError } = await locals.supabase.auth.getUser(); if (authError || !auth.user) redirect(303, '/');
  const now = new Date();
  const [groups, accounts, categories, targets] = await Promise.all([
    locals.supabase.from('budget_app_wallet_groups').select('id,name,kind').is('archived_at', null).order('name'),
    locals.supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency').is('archived_at', null),
    locals.supabase.from('budget_app_categories').select('id,name,kind').order('name'),
    locals.supabase.from('budget_app_budget_targets').select('id,wallet_group_id,currency,goal_kind,category_id,amount,period_start,period_type').order('created_at')
  ]);
  const activeTargets = (targets.data ?? []).flatMap((target: any) => {
    const type: PeriodType = isPeriod(target.period_type) ? target.period_type : 'month';
    const range = periodRange(type, now);
    return target.period_start === range.start ? [{ ...target, period_type: type, range }] : [];
  });
  const earliest = activeTargets.map((target: any) => target.range.start).sort()[0] ?? periodRange('month', now).start;
  const latest = activeTargets.map((target: any) => target.range.end).sort().at(-1) ?? periodRange('month', now).end;
  const tx = await locals.supabase.from('budget_app_transactions').select('kind,account_id,destination_account_id,amount,destination_amount,fee_amount,category_id,occurred_at').gte('occurred_at', `${earliest}T00:00:00Z`).lt('occurred_at', `${latest}T00:00:00Z`);
  const groupById = Object.fromEntries((groups.data ?? []).map((g: any) => [g.id, g]));
  const accountById = Object.fromEntries((accounts.data ?? []).map((a: any) => [a.id, a]));
  const categoryById = Object.fromEntries((categories.data ?? []).map((c: any) => [c.id, c]));
  const rows = activeTargets.map((target: any) => {
    let used = 0n;
    for (const row of tx.data ?? []) {
      const source = accountById[row.account_id]; const destination = accountById[row.destination_account_id];
      const occurred = String(row.occurred_at);
      if (occurred < `${target.range.start}T00:00:00` || occurred >= `${target.range.end}T00:00:00`) continue;
      const sourceMatches = source?.wallet_group_id === target.wallet_group_id && source.currency === target.currency;
      const destinationMatches = destination?.wallet_group_id === target.wallet_group_id && destination.currency === target.currency;
      if (target.goal_kind === 'savings_target') {
        if (sourceMatches) {
          if (row.kind === 'income') used += minor(String(row.amount));
          if (row.kind === 'expense') used -= minor(String(row.amount));
          if (row.kind === 'transfer') used -= minor(String(row.amount)) + minor(String(row.fee_amount ?? '0'));
        }
        if (row.kind === 'transfer' && destinationMatches) used += minor(String(row.destination_amount ?? '0'));
        continue;
      }
      if (!sourceMatches || (target.category_id && row.category_id !== target.category_id)) continue;
      if (target.goal_kind === 'income_target' && row.kind === 'income') used += minor(String(row.amount));
      if (target.goal_kind === 'spending_cap' && row.kind === 'expense') used += minor(String(row.amount));
      if (target.goal_kind === 'spending_cap' && row.kind === 'transfer') used += minor(String(row.fee_amount ?? '0'));
    }
    return { ...target, group_name: groupById[target.wallet_group_id]?.name ?? 'Wallet', group_kind: groupById[target.wallet_group_id]?.kind ?? 'project', category_name: categoryById[target.category_id]?.name ?? null, actual: decimal(used), period_end: target.range.end };
  });
  return { today: now.toISOString().slice(0, 10), groups: groups.data ?? [], accounts: accounts.data ?? [], categories: categories.data ?? [], targets: rows, loadError: groups.error?.message ?? accounts.error?.message ?? categories.error?.message ?? targets.error?.message ?? tx.error?.message ?? null };
};

export const actions: Actions = {
  save: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { data: auth, error: authError } = await locals.supabase.auth.getUser(); if (authError || !auth.user) redirect(303, '/');
    const form = await request.formData(); const groupId = str(form, 'wallet_group_id'); const currency = str(form, 'currency'); const goalKind = str(form, 'goal_kind'); const categoryId = str(form, 'category_id'); const periodTypeValue = str(form, 'period_type');
    try {
      const amount = money(str(form, 'amount'));
      if (!['USD', 'ZIG'].includes(currency) || !['spending_cap', 'income_target', 'savings_target'].includes(goalKind) || !isPeriod(periodTypeValue)) throw new Error('Choose a wallet, currency, goal type, and timeline.');
      if (goalKind === 'savings_target' && categoryId) throw new Error('Savings targets are tracked by wallet and currency, not by category.');
      const { data: group } = await locals.supabase.from('budget_app_wallet_groups').select('id,kind').eq('id', groupId).eq('owner_id', auth.user.id).is('archived_at', null).maybeSingle();
      if (!group) throw new Error('Choose an active wallet.');
      if (goalKind === 'savings_target' && group.kind !== 'project') throw new Error('Create a dedicated project wallet named Savings, then select it here. Transfers into that wallet will count as savings allocations.');
      const { data: currencyAccount } = await locals.supabase.from('budget_app_wallet_accounts').select('id').eq('wallet_group_id', groupId).eq('owner_id', auth.user.id).eq('currency', currency).is('archived_at', null).limit(1).maybeSingle();
      if (!currencyAccount) throw new Error('That wallet does not have an active account in the selected currency.');
      const expected = goalKind === 'income_target' ? 'income' : 'expense';
      if (categoryId) {
        const { data: category } = await locals.supabase.from('budget_app_categories').select('kind').eq('id', categoryId).eq('owner_id', auth.user.id).maybeSingle();
        if (!category || category.kind !== expected) throw new Error('Choose a category matching the goal type.');
      }
      const periodStart = periodRange(periodTypeValue, new Date()).start;
      let existingQuery = locals.supabase.from('budget_app_budget_targets').select('id').eq('owner_id', auth.user.id).eq('wallet_group_id', groupId).eq('currency', currency).eq('goal_kind', goalKind).eq('period_type', periodTypeValue).eq('period_start', periodStart);
      existingQuery = categoryId ? existingQuery.eq('category_id', categoryId) : existingQuery.is('category_id', null);
      const { data: existing } = await existingQuery.maybeSingle();
      const values = { amount, owner_id: auth.user.id, wallet_group_id: groupId, currency, goal_kind: goalKind, category_id: categoryId || null, period_start: periodStart, period_type: periodTypeValue };
      const result = existing ? await locals.supabase.from('budget_app_budget_targets').update(values).eq('id', existing.id) : await locals.supabase.from('budget_app_budget_targets').insert(values);
      if (result.error) throw new Error(result.error.message);
    } catch (error) { return fail(400, { message: error instanceof Error ? error.message : 'Could not save this target.' }); }
    redirect(303, '/budgets');
  },
  remove: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { data: auth, error } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData(); const { error: removeError } = await locals.supabase.from('budget_app_budget_targets').delete().eq('id', str(form, 'id')).eq('owner_id', auth.user.id);
    if (removeError) return fail(400, { message: removeError.message });
    redirect(303, '/budgets');
  }
};
