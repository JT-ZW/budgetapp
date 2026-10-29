import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { creditProgress } from '$lib/credit';
import { loadCreditData } from '$lib/server/credit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const { data: auth } = await locals.supabase.auth.getUser();
  if (!auth.user) redirect(303, '/');
  const results = await Promise.all([
    loadCreditData(locals.supabase),
    locals.supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,channel,archived_at'),
    locals.supabase.from('budget_app_wallet_groups').select('id,name,archived_at'),
    locals.supabase.from('budget_app_categories').select('id,name').eq('kind', 'expense').order('name')
  ]);
  const [creditData, accounts, groups, categories] = results;
  const [credits, instalments, movements] = creditData;
  const loadError = [...creditData, accounts, groups, categories].find((r) => r.error)?.error?.message ?? null;
  const orderedMovements = movements.data.slice().sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Harare', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return {
    today, credits: loadError ? [] : credits.data.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((c) => creditProgress(c, orderedMovements, instalments.data, today)),
    accounts: (accounts.data ?? []).map((a) => ({ ...a, label: `${groups.data?.find((g) => g.id === a.wallet_group_id)?.name ?? 'Wallet'} · ${a.channel ?? 'Project'} · ${a.currency}`, active: !a.archived_at && groups.data?.some((g) => g.id === a.wallet_group_id && !g.archived_at) })),
    categories: categories.data ?? [], loadError
  };
};

const operation = (action: string): Actions[string] => async ({ request, locals }) => {
  if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
  const { data: auth } = await locals.supabase.auth.getUser();
  if (!auth.user) redirect(303, '/');
  const form = await request.formData();
  const payload = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value).trim()]));
  for (const key of ['principal', 'charges', 'amount']) {
    if (key in payload && !/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(payload[key])) return fail(400, { message: 'Enter amounts with up to two decimal places.' });
  }
  const { error } = await locals.supabase.rpc('budget_app_manage_credit', { p_action: action, p_data: payload });
  if (error) return fail(400, { message: error.message });
  return { message: action === 'create' ? (payload.kind === 'lent' ? 'Lending recorded and wallet balance updated.' : 'Borrowing recorded and wallet balances updated.') : action === 'repay' ? 'Repayment recorded and wallet balances updated.' : 'Repayment plan updated.', success: true };
};
export const actions: Actions = {
  create: operation('create'), instalment: operation('instalment'), repay: operation('repay'),
  removeInstalment: operation('removeInstalment'), dueDate: operation('dueDate')
};
