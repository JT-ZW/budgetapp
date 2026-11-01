import { fail, redirect } from '@sveltejs/kit';

export async function saveShortcut(request: Request, locals: App.Locals) {
  if (!locals.supabase) redirect(303, '/');
  const supabase = locals.supabase;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect(303, '/');
  const form = await request.formData();
  const get = (key: string) => String(form.get(key) ?? '').trim();
  const id = get('id'), name = get('name'), kind = get('kind'), amount = get('amount');
  if (!name || name.length > 80 || !['income', 'expense'].includes(kind)) return fail(400, { message: 'Enter a shortcut name and choose income or spending.' });
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return fail(400, { message: 'Enter an amount greater than zero with up to two decimal places.' });
  const [account, category] = await Promise.all([
    supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id').eq('id', get('account_id')).eq('owner_id', auth.user.id).is('archived_at', null).maybeSingle(),
    supabase.from('budget_app_categories').select('id,kind').eq('id', get('category_id')).eq('owner_id', auth.user.id).maybeSingle()
  ]);
  if (account.error || !account.data) return fail(400, { message: 'Choose an active wallet account.' });
  const group = await supabase.from('budget_app_wallet_groups').select('id').eq('id', account.data.wallet_group_id).is('archived_at', null).maybeSingle();
  if (group.error || !group.data) return fail(400, { message: 'Choose an active wallet.' });
  if (category.error || !category.data || category.data.kind !== kind) return fail(400, { message: 'Choose a category matching the shortcut type.' });
  const values = { owner_id: auth.user.id, name, kind, amount, account_id: account.data.id, category_id: category.data.id };
  const result = id
    ? await supabase.from('budget_app_transaction_shortcuts').update(values).eq('id', id).eq('owner_id', auth.user.id).select('id').single()
    : await supabase.from('budget_app_transaction_shortcuts').insert(values).select('id').single();
  if (result.error) return fail(400, { message: 'Could not save the shortcut. Refresh and try again.' });
  redirect(303, '/settings#transaction-shortcuts');
}
