import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function decimal(value: string, allowZero = false): string {
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Enter a valid amount with up to two decimal places.');
  const [whole, fraction = ''] = normalized.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  if (!allowZero && minor === 0n) throw new Error('Amount must be greater than zero.');
  return `${whole}.${fraction.padEnd(2, '0')}`;
}

function text(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.supabase) redirect(303, '/');
  const supabase = locals.supabase;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect(303, '/');
  const pageSize = 10;
  let page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const [accountsResult, groupsResult, categoriesResult] = await Promise.all([
    locals.supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,channel,archived_at'),
    locals.supabase.from('budget_app_wallet_groups').select('id,name,kind').is('archived_at', null).order('name'),
    locals.supabase.from('budget_app_categories').select('id,name,kind').order('kind').order('name')
  ]);
  const activeGroups = groupsResult.data ?? [];
  const activeGroupIds = new Set(activeGroups.map((group) => group.id));
  const allActiveWalletAccounts = (accountsResult.data ?? []).filter((account) => activeGroupIds.has(account.wallet_group_id));
  const activeAccounts = allActiveWalletAccounts.filter((account) => !account.archived_at);
  const requestedWallet = url.searchParams.get('wallet') ?? '';
  const selectedWallet = activeGroups.find((group) => group.id === requestedWallet) ?? null;
  const walletAccountIds = selectedWallet ? allActiveWalletAccounts.filter((account) => account.wallet_group_id === selectedWallet.id).map((account) => account.id) : [];
  const transactionQuery = (pageNumber: number) => {
    let query = supabase.from('budget_app_transactions')
      .select('id,kind,account_id,destination_account_id,amount,destination_amount,fee_amount,category_id,description,occurred_at', { count: 'exact' })
      .order('occurred_at', { ascending: false });
    if (selectedWallet) {
      if (walletAccountIds.length) {
        const ids = walletAccountIds.join(',');
        query = query.or(`account_id.in.(${ids}),destination_account_id.in.(${ids})`);
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      }
    }
    return query.range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1);
  };
  let transactionsResult = await transactionQuery(page);
  const totalTransactions = transactionsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalTransactions / pageSize));
  if (page > totalPages) {
    page = totalPages;
    transactionsResult = await transactionQuery(page);
  }
  return {
    accounts: allActiveWalletAccounts,
    groups: activeGroups,
    categories: categoriesResult.data ?? [],
    transactions: transactionsResult.data ?? [],
    page,
    pageSize,
    totalTransactions,
    totalPages,
    walletFilter: selectedWallet?.id ?? '',
    walletFilterName: selectedWallet?.name ?? '',
    loadError: accountsResult.error?.message ?? groupsResult.error?.message ?? categoriesResult.error?.message ?? transactionsResult.error?.message ?? null
  };
};

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { data: auth, error: authError } = await locals.supabase.auth.getUser();
    if (authError || !auth.user) redirect(303, '/');
    const form = await request.formData();
    const kind = text(form, 'kind');
    const accountId = text(form, 'account_id');
    const destinationId = text(form, 'destination_account_id');
    const categoryId = text(form, 'category_id');
    const description = text(form, 'description').slice(0, 240);
    const dateValue = text(form, 'occurred_on');
    try {
      if (!['income', 'expense', 'transfer'].includes(kind)) throw new Error('Choose income, spending, or transfer.');
      const amount = decimal(text(form, 'amount'));
      const feeAmount = kind === 'transfer' ? decimal(text(form, 'fee_amount') || '0', true) : '0.00';
      if (!categoryId && kind !== 'transfer') throw new Error('Choose a category for this transaction.');
      if (!dateValue || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) || Number.isNaN(Date.parse(`${dateValue}T12:00:00Z`))) throw new Error('Choose a valid transaction date.');

      const { data: source, error: sourceError } = await locals.supabase.from('budget_app_wallet_accounts').select('id,currency').eq('id', accountId).eq('owner_id', auth.user.id).is('archived_at', null).maybeSingle();
      if (sourceError || !source) throw new Error('Choose an active source wallet.');
      let destinationAmount: string | null = null;
      let exchangeRate: string | null = null;
      if (kind === 'transfer') {
        if (!destinationId || destinationId === accountId) throw new Error('Choose a different destination wallet.');
        const { data: destination, error: destinationError } = await locals.supabase.from('budget_app_wallet_accounts').select('id,currency').eq('id', destinationId).eq('owner_id', auth.user.id).is('archived_at', null).maybeSingle();
        if (destinationError || !destination) throw new Error('Choose an active destination wallet.');
        if (source.currency === destination.currency) destinationAmount = amount;
        else {
          destinationAmount = decimal(text(form, 'destination_amount'));
          const rawRate = text(form, 'exchange_rate');
          if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,10})?$/.test(rawRate) || Number(rawRate) <= 0) throw new Error('Enter the exchange rate used.');
          exchangeRate = rawRate;
        }
        if (BigInt(feeAmount.replace('.', '')) > 0n && !categoryId) throw new Error('Choose an expense category for the transfer fee.');
      }
      if (categoryId) {
        const expected = kind === 'income' ? 'income' : 'expense';
        const { data: category, error: categoryError } = await locals.supabase.from('budget_app_categories').select('id,kind').eq('id', categoryId).eq('owner_id', auth.user.id).maybeSingle();
        if (categoryError || !category || category.kind !== expected) throw new Error(kind === 'transfer' ? 'Transfer fees need an expense category.' : 'Choose a category that matches this transaction.');
      }
      const { error } = await locals.supabase.from('budget_app_transactions').insert({
        owner_id: auth.user.id, kind, account_id: accountId,
        destination_account_id: kind === 'transfer' ? destinationId : null,
        amount, destination_amount: destinationAmount, exchange_rate: exchangeRate,
        fee_amount: feeAmount, category_id: categoryId || null, description,
        occurred_at: new Date(`${dateValue}T12:00:00Z`).toISOString()
      });
      if (error) throw new Error(error.message);
    } catch (error) {
      return fail(400, { message: error instanceof Error ? error.message : 'Could not save this transaction.' });
    }
    redirect(303, '/transactions');
  }
};
