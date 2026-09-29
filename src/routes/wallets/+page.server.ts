import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const { data: auth, error: authError } = await locals.supabase.auth.getUser();
  if (authError || !auth.user) redirect(303, '/');

  const [groupsResult, balancesResult] = await Promise.all([
    locals.supabase.from('budget_app_wallet_groups').select('id,name,kind,created_at,wallet_accounts:budget_app_wallet_accounts(id,currency,channel,opening_balance,archived_at)').is('archived_at', null).order('kind').order('name'),
    locals.supabase.rpc('budget_app_get_account_balances')
  ]);
  const groups = (groupsResult.data ?? []).map((group: any) => ({
    ...group,
    wallet_accounts: (group.wallet_accounts ?? []).filter((account: any) => !account.archived_at)
  }));
  const balances = Object.fromEntries((balancesResult.data ?? []).map((row: any) => [row.account_id, String(row.balance)]));
  return {
    groups,
    balances,
    loadError: groupsResult.error?.message ?? balancesResult.error?.message ?? null
  };
};
