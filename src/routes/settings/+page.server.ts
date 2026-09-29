import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
const clean = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
async function signedIn(locals: App.Locals) {
  if (!locals.supabase) redirect(303, '/');
  const { data, error } = await locals.supabase.auth.getUser();
  if (error || !data.user) redirect(303, '/');
  return { supabase: locals.supabase, user: data.user };
}
export const load: PageServerLoad = async ({ locals }) => {
  const { supabase } = await signedIn(locals);
  const [groups, categories, accounts] = await Promise.all([
    supabase.from('budget_app_wallet_groups').select('id,name,kind,archived_at,created_at').order('created_at'),
    supabase.from('budget_app_categories').select('id,name,kind,created_at').order('kind').order('name'),
    supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,channel,opening_balance,archived_at')
  ]);
  const groupById = Object.fromEntries((groups.data ?? []).map((group: any) => [group.id, group]));
  const allAccounts = accounts.data ?? [];
  const accountRows = allAccounts.filter((account: any) => !account.archived_at && !groupById[account.wallet_group_id]?.archived_at).map((account: any) => ({ ...account, group_name: groupById[account.wallet_group_id]?.name ?? 'Wallet', group_kind: groupById[account.wallet_group_id]?.kind ?? 'project' }));
  const groupsWithCurrencies = (groups.data ?? []).map((group: any) => ({ ...group, currencies: allAccounts.filter((account: any) => account.wallet_group_id === group.id && !account.archived_at).map((account: any) => account.currency) }));
  return { groups: groupsWithCurrencies, categories: categories.data ?? [], accounts: accountRows, loadError: groups.error?.message ?? categories.error?.message ?? accounts.error?.message ?? null };
};
export const actions: Actions = {
  createProject: async ({ request, locals }) => {
    const { supabase } = await signedIn(locals);
    const form = await request.formData(); const name = clean(form, 'name'); const currencies = form.getAll('currencies').map(String);
    if (name.length < 1 || name.length > 80) return fail(400, { message: 'Project names must be 1 to 80 characters.' });
    if (!currencies.length || currencies.some((currency) => !['USD', 'ZIG'].includes(currency))) return fail(400, { message: 'Choose at least one wallet currency.' });
    const { error } = await supabase.rpc('budget_app_create_project_wallet', { project_name: name, currencies });
    if (error) return fail(400, { message: error.message.includes('unique') ? 'A wallet with that name already exists.' : error.message });
    redirect(303, '/settings');
  },
  updateProject: async ({ request, locals }) => {
    const { supabase } = await signedIn(locals);
    const form = await request.formData(); const id = clean(form, 'id'); const name = clean(form, 'name'); const currencies = form.getAll('currencies').map(String);
    if (!id || name.length < 1 || name.length > 80) return fail(400, { message: 'Enter a wallet name between 1 and 80 characters.' });
    if (!currencies.length || currencies.some((currency) => !['USD', 'ZIG'].includes(currency))) return fail(400, { message: 'Choose at least one wallet currency.' });
    const { error } = await supabase.rpc('budget_app_update_project_wallet', { wallet_id: id, project_name: name, currencies });
    if (error) return fail(400, { message: error.message.includes('unique') ? 'A wallet with that name already exists.' : error.message });
    redirect(303, '/settings');
  },
  createCategory: async ({ request, locals }) => {
    const { supabase, user } = await signedIn(locals);
    const form = await request.formData(); const name = clean(form, 'name'); const kind = clean(form, 'kind');
    if (name.length < 1 || name.length > 60) return fail(400, { message: 'Category names must be 1 to 60 characters.' });
    if (!['income', 'expense'].includes(kind)) return fail(400, { message: 'Choose income or expense for the category.' });
    const { error } = await supabase.from('budget_app_categories').insert({ owner_id: user.id, name, kind });
    if (error) return fail(400, { message: error.message.includes('unique') ? 'That category already exists.' : error.message });
    redirect(303, '/settings');
  },
  setOpeningBalance: async ({ request, locals }) => {
    const { supabase, user } = await signedIn(locals);
    const form = await request.formData(); const id = clean(form, 'id'); const raw = clean(form, 'opening_balance');
    if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(raw)) return fail(400, { message: 'Enter zero or a valid amount with up to two decimal places.' });
    const [whole, fraction = ''] = raw.split('.'); const opening_balance = `${whole}.${fraction.padEnd(2, '0')}`;
    const { error } = await supabase.from('budget_app_wallet_accounts').update({ opening_balance }).eq('id', id).eq('owner_id', user.id);
    if (error) return fail(400, { message: error.message });
    redirect(303, '/settings');
  },
  setProjectArchive: async ({ request, locals }) => {
    const { supabase, user } = await signedIn(locals);
    const form = await request.formData(); const id = clean(form, 'id'); const archived = clean(form, 'archived') === 'true';
    const { error } = await supabase.from('budget_app_wallet_groups').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', id).eq('owner_id', user.id).eq('kind', 'project');
    if (error) return fail(400, { message: error.message });
    redirect(303, '/settings');
  }
};
