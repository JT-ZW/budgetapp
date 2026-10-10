import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function text(form: FormData, key: string) { return String(form.get(key) ?? '').trim(); }
function amount(value: string, zero = false, scale = 2) {
  const v = value.trim();
  const pattern = new RegExp(`^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,${scale}})?$`);
  if (!pattern.test(v)) throw new Error(`Enter a valid amount with up to ${scale} decimal places.`);
  if (!zero && Number(v) <= 0) throw new Error('Amount must be greater than zero.');
  return v;
}
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new Error('Choose a valid date.');
  return value;
}
function handleError(error: unknown, fallback: string) {
  return fail(400, { message: error instanceof Error ? error.message : fallback });
}

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const supabase = locals.supabase;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect(303, '/');
  const [accountsResult, walletsResult] = await Promise.all([
    supabase.from('budget_app_investment_accounts').select('*').order('created_at'),
    supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,channel,archived_at,opening_balance,wallet_group:budget_app_wallet_groups(name,kind,archived_at)').order('currency')
  ]);
  const accounts = accountsResult.data ?? [];
  const accountIds = accounts.map((a) => a.id);
  const [movementsResult, countersResult, tradesResult, pricesResult, valuesResult] = accountIds.length ? await Promise.all([
    supabase.from('budget_app_investment_cash_movements').select('*').in('investment_account_id', accountIds).order('occurred_at', { ascending: false }),
    supabase.from('budget_app_investment_counters').select('*').in('investment_account_id', accountIds).order('company_name'),
    supabase.from('budget_app_investment_trades').select('*').in('investment_account_id', accountIds).order('occurred_at', { ascending: false }),
    supabase.from('budget_app_investment_prices').select('*').order('price_date', { ascending: false }),
    supabase.from('budget_app_forex_valuations').select('*').in('investment_account_id', accountIds).order('valuation_date', { ascending: false })
  ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
  const counters = countersResult.data ?? [];
  const counterIds = counters.map((c) => c.id);
  const prices = counterIds.length ? await supabase.from('budget_app_investment_prices').select('*').in('counter_id', counterIds).order('price_date', { ascending: false }) : { data: [], error: null };
  const latestPrice = new Map<string, any>();
  for (const row of prices.data ?? []) if (!latestPrice.has(row.counter_id)) latestPrice.set(row.counter_id, row);
  const trades = tradesResult.data ?? [];
  const movements = movementsResult.data ?? [];
  const valuations = valuesResult.data ?? [];
  const positions = counters.map((counter) => {
    const rows = trades.filter((trade) => trade.counter_id === counter.id);
    const buys = rows.filter((t) => t.kind === 'buy' || t.kind === 'opening');
    const sells = rows.filter((t) => t.kind === 'sell');
    const shares = buys.reduce((n, t) => n + Number(t.quantity), 0) - sells.reduce((n, t) => n + Number(t.quantity), 0);
    const totalCost = buys.reduce((n, t) => n + Number(t.quantity) * Number(t.unit_price) + Number(t.fees), 0);
    const soldCost = sells.reduce((n, t) => n + Number(t.realized_cost_basis ?? 0), 0);
    const costBasis = totalCost - soldCost;
    const quote = latestPrice.get(counter.id);
    const marketValue = quote ? shares * Number(quote.closing_price) : null;
    return { ...counter, shares, costBasis, marketValue, quoteDate: quote?.price_date ?? null, closingPrice: quote?.closing_price ?? null, unrealized: marketValue === null ? null : marketValue - costBasis };
  });
  const enrichedAccounts = accounts.map((account) => {
    const accountMovements = movements.filter((m) => m.investment_account_id === account.id);
    const accountTrades = trades.filter((t) => t.investment_account_id === account.id);
    const latestValuation = valuations.find((v) => v.investment_account_id === account.id) ?? null;
    const deposits = accountMovements.filter((m) => m.kind === 'deposit').reduce((n, m) => n + Number(m.amount), 0);
    const withdrawals = accountMovements.filter((m) => m.kind === 'withdrawal').reduce((n, m) => n + Number(m.amount), 0);
    const openingCapital = Number(account.opening_capital ?? 0);
    const openingPositionCost = accountTrades.filter((t) => t.kind === 'opening').reduce((n, t) => n + Number(t.quantity) * Number(t.unit_price) + Number(t.fees), 0);
    const netContribution = openingCapital + openingPositionCost + deposits - withdrawals;
    const currentCash = openingCapital + accountMovements.reduce((n, m) => n + (m.kind === 'deposit' ? 1 : -1) * Number(m.amount), 0) + accountTrades.filter((t) => t.kind === 'buy' || t.kind === 'sell').reduce((n, t) => n + (t.kind === 'buy' ? -1 : 1) * (Number(t.quantity) * Number(t.unit_price)) - Number(t.fees), 0);
    const accountPositions = positions.filter((p) => p.investment_account_id === account.id && p.shares > 0);
    const pricedSharesValue = accountPositions.reduce((n, p) => n + (p.marketValue ?? 0), 0);
    const unpricedPositions = accountPositions.filter((p) => p.marketValue === null);
    const unpricedPositionCost = unpricedPositions.reduce((n, p) => n + p.costBasis, 0);
    // Until a close is entered, carry those shares at their remaining cost basis.
    // This prevents a missing quote from being reported as a 100% loss.
    const sharesValue = pricedSharesValue + unpricedPositionCost;
    const forexFlowSinceClose = latestValuation ? accountMovements.filter((m) => String(m.occurred_at).slice(0, 10) > latestValuation.valuation_date).reduce((n, m) => n + (m.kind === 'deposit' ? 1 : -1) * Number(m.amount), 0) : 0;
    const totalValue = account.kind === 'forex' ? Number(latestValuation?.closing_equity ?? openingCapital) + forexFlowSinceClose : currentCash + sharesValue;
    const realized = accountTrades.filter((t) => t.kind === 'sell').reduce((n, t) => n + Number(t.realized_profit ?? 0), 0);
    const stockUnrealized = accountPositions.filter((p) => p.unrealized !== null).reduce((n, p) => n + Number(p.unrealized), 0);
    const gain = account.kind === 'forex' ? totalValue + withdrawals - deposits - openingCapital : sharesValue + currentCash - deposits + withdrawals - openingCapital - openingPositionCost;
    return { ...account, movements: accountMovements, latestValuation, valuationHistory: valuations.filter((v) => v.investment_account_id === account.id).slice(0, 30), deposits, withdrawals, netContribution, currentCash, positions: accountPositions, sharesValue, unpricedPositionCost, unpricedPositionCount: unpricedPositions.length, valuationPending: account.kind === 'stocks' && unpricedPositions.length > 0, totalValue, realized, stockUnrealized, gain,
      returnPercent: netContribution ? gain / netContribution * 100 : null };
  });
  const loadError = [accountsResult, walletsResult, movementsResult, countersResult, tradesResult, pricesResult, valuesResult, prices].find((r: any) => r.error)?.error?.message ?? null;
  return { accounts: enrichedAccounts, wallets: (walletsResult.data ?? []).filter((w: any) => !w.archived_at && !w.wallet_group?.archived_at), counters, positions, trades, movements, valuations, prices: prices.data ?? [], today: new Date().toISOString().slice(0, 10), loadError };
};

export const actions: Actions = {
  createAccount: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { data: auth, error } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const name = text(form, 'name'); const kind = text(form, 'kind'); const currency = text(form, 'currency');
      const capital = amount(text(form, 'initial_capital') || '0', true);
      if (!name || !['stocks', 'forex'].includes(kind) || !['USD', 'ZIG'].includes(currency)) throw new Error('Complete the account details.');
      const { error: saveError } = await locals.supabase.rpc('budget_app_create_investment_account', { account_name: name, account_kind: kind, account_currency: currency, funding_wallet_id: null, initial_capital: capital });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not create this investment account.'); }
    return { success: true, message: 'Investment account created.' };
  },
  updateOpeningCapital: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { error, data: auth } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const accountId = text(form, 'investment_account_id'); const capital = amount(text(form, 'opening_capital') || '0', true);
      const { error: saveError } = await locals.supabase.rpc('budget_app_set_investment_opening_capital', { p_account_id: accountId, p_amount: capital });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not update this opening amount.'); }
    return { success: true, message: 'Opening amount saved.' };
  },
  importExisting: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { data: auth, error } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const accountId = text(form, 'investment_account_id'); const company = text(form, 'counter_name'); const ticker = company.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9.-]/g, '').slice(0, 20);
      const { data: account } = await locals.supabase.from('budget_app_investment_accounts').select('kind').eq('id', accountId).eq('owner_id', auth.user.id).maybeSingle();
      if (!account || account.kind !== 'stocks') throw new Error('Choose a stocks account.');
      const qty = amount(text(form, 'quantity'), false, 6); const buyPrice = amount(text(form, 'unit_price'), false, 6);
      const fees = amount(text(form, 'fees') || '0', true); const acquired = dateValue(text(form, 'occurred_on'));
      const { error: saveError } = await locals.supabase.rpc('budget_app_import_stock_holding', {
        p_investment_account_id: accountId, p_ticker: ticker, p_company_name: company,
        p_quantity: qty, p_buy_price: buyPrice, p_fees: fees, p_occurred_at: new Date(`${acquired}T12:00:00Z`).toISOString()
      });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not import this existing holding.'); }
    return { success: true, message: 'Existing shares imported without changing your personal wallet.' };
  },
  newPurchase: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { data: auth, error } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const accountId = text(form, 'investment_account_id'); const walletId = text(form, 'wallet_account_id');
      const company = text(form, 'counter_name'); const ticker = company.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9.-]/g, '').slice(0, 20);
      const qty = amount(text(form, 'quantity'), false, 6); const price = amount(text(form, 'unit_price'), false, 6);
      const fees = amount(text(form, 'fees') || '0', true); const occurred = dateValue(text(form, 'occurred_on'));
      const fundingSource = text(form, 'funding_source');
      let saveError;
      if (fundingSource === 'brokerage') {
        const result = await locals.supabase.rpc('budget_app_buy_stock_from_brokerage', {
          p_investment_account_id: accountId, p_ticker: ticker, p_company_name: company,
          p_quantity: qty, p_unit_price: price, p_fees: fees,
          p_occurred_at: new Date(`${occurred}T12:00:00Z`).toISOString(), p_description: text(form, 'description')
        });
        saveError = result.error;
      } else if (fundingSource === 'wallet') {
        const result = await locals.supabase.rpc('budget_app_buy_stock_from_wallet', {
          p_investment_account_id: accountId, p_wallet_account_id: walletId, p_ticker: ticker,
          p_company_name: company, p_quantity: qty, p_unit_price: price, p_fees: fees,
          p_occurred_at: new Date(`${occurred}T12:00:00Z`).toISOString(), p_description: text(form, 'description')
        });
        saveError = result.error;
      } else throw new Error('Choose whether to pay from brokerage cash or a personal wallet.');
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not save this stock purchase.'); }
    return { success: true, message: 'Stock purchase recorded. The wallet debit includes the share cost and transfer charges.' };
  },
  openingLot: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { error, data: auth } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const counter = text(form, 'counter_id'); const qty = amount(text(form, 'quantity'), false, 6); const buyPrice = amount(text(form, 'unit_price'), false, 6);
      const fees = amount(text(form, 'fees') || '0', true); const currentPrice = amount(text(form, 'current_price'), false, 6);
      const acquired = dateValue(text(form, 'occurred_on')); const priceDate = dateValue(text(form, 'price_date'));
      const { error: saveError } = await locals.supabase.rpc('budget_app_add_opening_position', { p_counter_id: counter, p_quantity: qty, p_buy_price: buyPrice, p_fees: fees, p_current_price: currentPrice, p_acquired_at: new Date(`${acquired}T12:00:00Z`).toISOString(), p_price_date: priceDate });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not import this existing purchase lot.'); }
    return { success: true, message: 'Existing purchase lot imported.' };
  },
  trade: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { error, data: auth } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const counter = text(form, 'counter_id'); const kind = text(form, 'kind'); const quantity = amount(text(form, 'quantity'), false, 6); const price = amount(text(form, 'unit_price'), false, 6); const fees = amount(text(form, 'fees') || '0', true);
      const occurred = dateValue(text(form, 'occurred_on'));
      const { error: saveError } = await locals.supabase.rpc('budget_app_record_stock_trade', { p_counter_id: counter, p_kind: kind, p_quantity: quantity, p_unit_price: price, p_fees: fees, p_occurred_at: new Date(`${occurred}T12:00:00Z`).toISOString(), p_description: text(form, 'description') });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not save this trade.'); }
    return { success: true, message: 'Stock trade saved.' };
  },
  price: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { error, data: auth } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const counter = text(form, 'counter_id'); const price = amount(text(form, 'closing_price'), false, 6); const date = dateValue(text(form, 'price_date'));
      const { error: saveError } = await locals.supabase.from('budget_app_investment_prices').upsert({ owner_id: auth.user.id, counter_id: counter, closing_price: price, price_date: date }, { onConflict: 'counter_id,price_date' });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not save this closing price.'); }
    return { success: true, message: 'Closing price saved.' };
  },
  valuation: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { error, data: auth } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const account = text(form, 'investment_account_id'); const equity = amount(text(form, 'closing_equity'), true); const date = dateValue(text(form, 'valuation_date'));
      const { error: saveError } = await locals.supabase.from('budget_app_forex_valuations').upsert({ owner_id: auth.user.id, investment_account_id: account, closing_equity: equity, valuation_date: date, note: text(form, 'note') }, { onConflict: 'investment_account_id,valuation_date' });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not save this daily value.'); }
    return { success: true, message: 'Daily forex equity saved.' };
  },
  cashMovement: async ({ request, locals }) => {
    if (!locals.supabase) return fail(503, { message: 'Database connection is not configured.' });
    const { error, data: auth } = await locals.supabase.auth.getUser(); if (error || !auth.user) redirect(303, '/');
    const form = await request.formData();
    try {
      const accountId = text(form, 'investment_account_id'); const walletId = text(form, 'wallet_account_id'); const kind = text(form, 'kind'); const value = amount(text(form, 'amount')); const date = dateValue(text(form, 'occurred_on'));
      const { data: account } = await locals.supabase.from('budget_app_investment_accounts').select('currency,kind,opening_capital').eq('id', accountId).eq('owner_id', auth.user.id).maybeSingle();
      const { data: wallet } = await locals.supabase.from('budget_app_wallet_accounts').select('currency').eq('id', walletId).eq('owner_id', auth.user.id).is('archived_at', null).maybeSingle();
      if (!account || !wallet || account.currency !== wallet.currency || !['deposit','withdrawal'].includes(kind)) throw new Error('Choose a matching investment account and personal wallet.');
      if (kind === 'withdrawal') {
        const { data: history } = await locals.supabase.from('budget_app_investment_cash_movements').select('kind,amount,occurred_at').eq('investment_account_id', accountId);
        let available = 0;
        if (account.kind === 'stocks') {
          const { data: stockTrades } = await locals.supabase.from('budget_app_investment_trades').select('kind,quantity,unit_price,fees').eq('investment_account_id', accountId);
          available = Number(account.opening_capital ?? 0) + (history ?? []).reduce((n, row) => n + (row.kind === 'deposit' ? 1 : -1) * Number(row.amount), 0) + (stockTrades ?? []).filter((row) => row.kind === 'buy' || row.kind === 'sell').reduce((n, row) => n + (row.kind === 'buy' ? -1 : 1) * (Number(row.quantity) * Number(row.unit_price)) - Number(row.fees), 0);
        } else {
          const { data: closing } = await locals.supabase.from('budget_app_forex_valuations').select('valuation_date,closing_equity').eq('investment_account_id', accountId).lte('valuation_date', date).order('valuation_date', { ascending: false }).limit(1).maybeSingle();
          if (!closing) throw new Error('Record a closing equity value before withdrawing from forex.');
          available = Number(closing.closing_equity) + (history ?? []).filter((row) => String(row.occurred_at).slice(0, 10) > closing.valuation_date && String(row.occurred_at).slice(0, 10) <= date).reduce((n, row) => n + (row.kind === 'deposit' ? 1 : -1) * Number(row.amount), 0);
        }
        if (Number(value) > available + 0.000001) throw new Error(`Withdrawal exceeds the available investment balance (${available.toFixed(2)}).`);
      }
      const { error: saveError } = await locals.supabase.from('budget_app_investment_cash_movements').insert({ owner_id: auth.user.id, investment_account_id: accountId, wallet_account_id: walletId, kind, amount: value, occurred_at: new Date(`${date}T12:00:00Z`).toISOString(), description: text(form, 'description') });
      if (saveError) throw new Error(saveError.message);
    } catch (err) { return handleError(err, 'Could not save this transfer.'); }
    return { success: true, message: 'Investment transfer recorded.' };
  }
};
