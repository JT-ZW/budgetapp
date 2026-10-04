import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
function minor(value: string): bigint { const normalized = String(value).trim(); const negative = normalized.startsWith('-'); const [whole, fraction = ''] = normalized.replace(/^-/, '').split('.'); const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)); return negative ? -amount : amount; }
function decimal(value: bigint): string { const sign = value < 0n ? '-' : ''; const n = value < 0n ? -value : value; return `${sign}${n / 100n}.${String(n % 100n).padStart(2, '0')}`; }
export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.supabase) redirect(303, '/');
  const { data: auth, error: authError } = await locals.supabase.auth.getUser(); if (authError || !auth.user) redirect(303, '/');
  const now = new Date(); const currentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const startString = start.toISOString(); const endString = new Date(Date.UTC(currentMonth.getUTCFullYear(), currentMonth.getUTCMonth() + 1, 1)).toISOString();
  const [groupsResult, accountsResult, categoriesResult, txResult, balancesResult, investmentAccountsResult, countersResult, tradesResult, pricesResult, forexValuesResult, investmentMovementsResult] = await Promise.all([
    locals.supabase.from('budget_app_wallet_groups').select('id,name,kind,archived_at'),
    locals.supabase.from('budget_app_wallet_accounts').select('id,wallet_group_id,currency,channel,opening_balance,archived_at'),
    locals.supabase.from('budget_app_categories').select('id,name,kind'),
    locals.supabase.from('budget_app_transactions').select('kind,account_id,amount,fee_amount,category_id,occurred_at').gte('occurred_at', startString).lt('occurred_at', endString).order('occurred_at'),
    locals.supabase.rpc('budget_app_get_account_balances'),
    locals.supabase.from('budget_app_investment_accounts').select('*').order('created_at'),
    locals.supabase.from('budget_app_investment_counters').select('*').order('company_name'),
    locals.supabase.from('budget_app_investment_trades').select('*').order('occurred_at'),
    locals.supabase.from('budget_app_investment_prices').select('*').order('price_date'),
    locals.supabase.from('budget_app_forex_valuations').select('*').order('valuation_date'),
    locals.supabase.from('budget_app_investment_cash_movements').select('*').order('occurred_at')
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
  const investmentAccounts = investmentAccountsResult.data ?? [];
  const investmentTrades = tradesResult.data ?? [];
  const investmentFlows = investmentMovementsResult.data ?? [];
  const investmentPrices = pricesResult.data ?? [];
  const forexValues = forexValuesResult.data ?? [];
  const investmentCounters = countersResult.data ?? [];
  const investmentAnalysis = investmentAccounts.map((investmentAccount: any) => {
    const accountTrades = investmentTrades.filter((trade: any) => trade.investment_account_id === investmentAccount.id);
    const accountFlows = investmentFlows.filter((flow: any) => flow.investment_account_id === investmentAccount.id);
    const deposits = accountFlows.filter((flow: any) => flow.kind === 'deposit').reduce((sum: number, flow: any) => sum + Number(flow.amount), 0);
    const withdrawals = accountFlows.filter((flow: any) => flow.kind === 'withdrawal').reduce((sum: number, flow: any) => sum + Number(flow.amount), 0);
    const openingCapital = Number(investmentAccount.opening_capital ?? 0);
    if (investmentAccount.kind === 'forex') {
      const values = forexValues.filter((row: any) => row.investment_account_id === investmentAccount.id);
      const latest = values[values.length - 1] ?? null;
      const latestEquity = Number(latest?.closing_equity ?? openingCapital) + (latest ? accountFlows.filter((flow: any) => String(flow.occurred_at).slice(0,10) > latest.valuation_date).reduce((sum: number, flow: any) => sum + (flow.kind === 'deposit' ? 1 : -1) * Number(flow.amount), 0) : 0);
      const netCapital = openingCapital + deposits - withdrawals;
      return { ...investmentAccount, totalValue: latestEquity, netCapital, profitLoss: latestEquity + withdrawals - deposits - openingCapital,
        returnPercent: netCapital ? (latestEquity + withdrawals - deposits - openingCapital) / netCapital * 100 : null,
        daily: values.map((row: any) => ({ date: row.valuation_date, value: Number(row.closing_equity), note: row.note })), positions: [] };
    }
    const accountCounters = investmentCounters.filter((counter: any) => counter.investment_account_id === investmentAccount.id);
    const positions = accountCounters.map((counter: any) => {
      const rows = accountTrades.filter((trade: any) => trade.counter_id === counter.id);
      const lots = rows.filter((trade: any) => ['buy','opening'].includes(trade.kind));
      const sells = rows.filter((trade: any) => trade.kind === 'sell');
      const shares = lots.reduce((sum: number, lot: any) => sum + Number(lot.quantity), 0) - sells.reduce((sum: number, trade: any) => sum + Number(trade.quantity), 0);
      const totalCost = lots.reduce((sum: number, lot: any) => sum + Number(lot.quantity) * Number(lot.unit_price) + Number(lot.fees), 0);
      const soldCost = sells.reduce((sum: number, trade: any) => sum + Number(trade.realized_cost_basis ?? 0), 0);
      const costBasis = totalCost - soldCost;
      const quote = [...investmentPrices].reverse().find((price: any) => price.counter_id === counter.id);
      const marketValue = quote ? shares * Number(quote.closing_price) : 0;
      const history = investmentPrices.filter((price: any) => price.counter_id === counter.id).map((price: any) => {
        const heldAtDate = lots.filter((lot: any) => String(lot.occurred_at).slice(0,10) <= price.price_date).reduce((sum: number, lot: any) => sum + Number(lot.quantity), 0) - sells.filter((trade: any) => String(trade.occurred_at).slice(0,10) <= price.price_date).reduce((sum: number, trade: any) => sum + Number(trade.quantity), 0);
        return { date: price.price_date, value: heldAtDate * Number(price.closing_price), price: Number(price.closing_price) };
      });
      return { ...counter, shares, costBasis, marketValue, unrealized: marketValue - costBasis, currentPrice: quote?.closing_price ?? null, history };
    });
    const openingPositionCost = accountTrades.filter((trade: any) => trade.kind === 'opening').reduce((sum: number, trade: any) => sum + Number(trade.quantity) * Number(trade.unit_price) + Number(trade.fees), 0);
    const cash = openingCapital + deposits - withdrawals + accountTrades.filter((trade: any) => ['buy','sell'].includes(trade.kind)).reduce((sum: number, trade: any) => sum + (trade.kind === 'buy' ? -1 : 1) * (Number(trade.quantity) * Number(trade.unit_price)) - Number(trade.fees), 0);
    const marketValue = positions.reduce((sum: number, position: any) => sum + position.marketValue, 0);
    const netCapital = openingCapital + openingPositionCost + deposits - withdrawals;
    const profitLoss = marketValue + cash - netCapital;
    return { ...investmentAccount, totalValue: marketValue + cash, marketValue, cash, netCapital, profitLoss, returnPercent: netCapital ? profitLoss / netCapital * 100 : null, positions, daily: [] };
  });
  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const dateParam = (name: string, fallback: string) => {
    const value = url.searchParams.get(name) ?? fallback;
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : fallback;
  };
  const statementFrom = dateParam('from', defaultFrom);
  const statementTo = dateParam('to', today);
  const statementMode = ['both', 'income', 'expense'].includes(url.searchParams.get('activity') ?? '') ? url.searchParams.get('activity') as 'both' | 'income' | 'expense' : 'both';
  const visibleAccounts = (accountsResult.data ?? []).filter((account: any) => groups[account.wallet_group_id]);
  const statementWalletMap = new Map<string, any>();
  for (const account of visibleAccounts as any[]) {
    const group = groups[account.wallet_group_id];
    const key = `${account.wallet_group_id}:${account.currency}`;
    const wallet = statementWalletMap.get(key) ?? { key, walletGroupId: account.wallet_group_id, groupName: group.name, currency: account.currency, accountIds: [], openingBalance: 0n, archived: true };
    wallet.accountIds.push(account.id);
    wallet.openingBalance += minor(String(account.opening_balance ?? '0'));
    wallet.archived &&= Boolean(group.archived_at || account.archived_at);
    statementWalletMap.set(key, wallet);
  }
  const statementWallets = [...statementWalletMap.values()].map((wallet) => ({ key: wallet.key, groupName: wallet.groupName, currency: wallet.currency, archived: wallet.archived, label: `${wallet.groupName} · ${wallet.currency === 'USD' ? 'USD' : 'ZiG'}${wallet.archived ? ' · Archived' : ''}` }));
  const requestedWallet = url.searchParams.get('wallet') ?? '';
  const statementWallet = statementWalletMap.get(requestedWallet);
  const statementWalletKey = statementWallet?.key ?? '';
  const statementWalletLabel = statementWallet ? `${statementWallet.groupName} · ${statementWallet.currency === 'USD' ? 'USD' : 'ZiG'}${statementWallet.archived ? ' · Archived' : ''}` : '';
  let statement = { walletKey: statementWalletKey, accountName: statementWalletLabel, currency: statementWallet?.currency ?? 'USD', from: statementFrom, to: statementTo, activity: statementMode, opening: '0.00', closing: '0.00', rows: [] as { date: string; description: string; reference: string; type: string; debit: string; credit: string; balance: string }[], error: '' };
  if (statementWallet && statementFrom <= statementTo) {
    const accountIds = Array.isArray(statementWallet.accountIds) ? statementWallet.accountIds as string[] : [];
    if (accountIds.length === 0) statement.error = 'No wallet accounts are available for this statement.';
    else {
    const projection = 'id,kind,account_id,destination_account_id,amount,destination_amount,fee_amount,category_id,description,occurred_at,created_at';
    const accountIdList = accountIds.join(',');
    const accountIdSet = new Set(accountIds);
    const transactionFilter = () => locals.supabase!.from('budget_app_transactions').select(projection).or(`account_id.in.(${accountIdList}),destination_account_id.in.(${accountIdList})`).order('occurred_at', { ascending: true }).order('created_at', { ascending: true });
    const investmentMovementFilter = () => locals.supabase!.from('budget_app_investment_cash_movements').select('id,kind,amount,description,occurred_at,created_at').in('wallet_account_id', accountIds).order('occurred_at', { ascending: true }).order('created_at', { ascending: true });
    const loadRows = async (from?: string, until?: string) => {
      const rows: any[] = [];
      let offset = 0;
      while (true) {
        let query: any = transactionFilter();
        if (from) query = query.gte('occurred_at', from);
        if (until) query = query.lt('occurred_at', until);
        const result = await query.range(offset, offset + 999);
        if (result.error) return { data: rows, error: result.error };
        rows.push(...(result.data ?? []));
        if ((result.data ?? []).length < 1000) return { data: rows, error: null };
        offset += 1000;
      }
    };
    const loadInvestmentMovements = async (from?: string, until?: string) => {
      const rows: any[] = []; let offset = 0;
      while (true) {
        let query: any = investmentMovementFilter();
        if (from) query = query.gte('occurred_at', from);
        if (until) query = query.lt('occurred_at', until);
        const result = await query.range(offset, offset + 999);
        if (result.error) return { data: rows, error: result.error };
        rows.push(...(result.data ?? []));
        if ((result.data ?? []).length < 1000) return { data: rows, error: null };
        offset += 1000;
      }
    };
    const [beforeResult, rangeResult, beforeInvestmentResult, rangeInvestmentResult] = await Promise.all([
      loadRows(undefined, `${statementFrom}T00:00:00.000Z`),
      loadRows(`${statementFrom}T00:00:00.000Z`, `${new Date(Date.parse(`${statementTo}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`),
      loadInvestmentMovements(undefined, `${statementFrom}T00:00:00.000Z`),
      loadInvestmentMovements(`${statementFrom}T00:00:00.000Z`, `${new Date(Date.parse(`${statementTo}T00:00:00Z`) + 86400000).toISOString().slice(0, 10)}T00:00:00.000Z`)
    ]);
    if (beforeResult.error || rangeResult.error || beforeInvestmentResult.error || rangeInvestmentResult.error) statement.error = beforeResult.error?.message ?? rangeResult.error?.message ?? beforeInvestmentResult.error?.message ?? rangeInvestmentResult.error?.message ?? 'Could not load this statement.';
    else {
      let running = minor(statementWallet.openingBalance);
      const categoryMap = new Map<string, string>((categoriesResult.data ?? []).map((c: any) => [c.id, c.name]));
      const apply = (row: any, collect: boolean) => {
        if (row.investment_movement) {
          const deposit = row.kind === 'deposit';
          const delta = deposit ? -minor(String(row.amount)) : minor(String(row.amount));
          const type = deposit ? 'Investment deposit' : 'Investment withdrawal';
          running += delta;
          if (!collect) return;
          const selected = statementMode === 'both' || (statementMode === 'expense' && deposit);
          if (!selected) return;
          const absAmount = delta < 0n ? -delta : delta;
          statement.rows.push({ date: String(row.occurred_at), description: row.description || type, reference: row.id, type, debit: delta < 0n ? decimal(absAmount) : '', credit: delta > 0n ? decimal(absAmount) : '', balance: decimal(running) });
          return;
        }
        const source = accountIdSet.has(row.account_id);
        const destination = Boolean(row.destination_account_id && accountIdSet.has(row.destination_account_id));
        let delta = 0n; let type = ''; let description = row.description || '';
        if (row.kind === 'income' && source) { delta = minor(String(row.amount)); type = 'Income'; }
        else if (row.kind === 'expense' && source) { delta = -minor(String(row.amount)); type = 'Expense'; }
        else if (row.kind === 'transfer' && source && destination) { delta = -minor(String(row.fee_amount ?? '0')); type = 'Transfer fee'; }
        else if (row.kind === 'transfer' && source) { delta = -(minor(String(row.amount)) + minor(String(row.fee_amount ?? '0'))); type = 'Transfer out'; }
        else if (row.kind === 'transfer' && destination) { delta = minor(String(row.destination_amount ?? '0')); type = 'Transfer in'; }
        if (!type) return;
        if (row.kind === 'transfer' && source && destination && delta === 0n) return;
        running += delta;
        if (!collect) return;
        const selected = statementMode === 'both' || (statementMode === 'income' && type === 'Income') || (statementMode === 'expense' && (type === 'Expense' || type === 'Transfer out' || type === 'Transfer fee'));
        if (!selected) return;
        const amount = delta < 0n ? -delta : delta;
        statement.rows.push({ date: String(row.occurred_at), description: description || (row.kind === 'income' ? 'Income' : row.kind === 'expense' ? 'Spending' : type), reference: row.id, type, debit: delta < 0n ? decimal(amount) : '', credit: delta > 0n ? decimal(amount) : '', balance: decimal(running) });
      };
      const beforeEvents = [...(beforeResult.data ?? []), ...(beforeInvestmentResult.data ?? []).map((row: any) => ({ ...row, investment_movement: true }))].sort((a: any, b: any) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
      const rangeEvents = [...(rangeResult.data ?? []), ...(rangeInvestmentResult.data ?? []).map((row: any) => ({ ...row, investment_movement: true }))].sort((a: any, b: any) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
      for (const row of beforeEvents) apply(row, false);
      statement.opening = decimal(running);
      for (const row of rangeEvents) apply(row, true);
      statement.closing = decimal(running);
      statement.rows = statement.rows.map((row) => ({ ...row, description: row.description || (row.type.startsWith('Transfer') ? row.type : row.type === 'Income' ? 'Income' : 'Spending') }));
      for (const row of statement.rows) {
        const original = (rangeResult.data ?? []).find((tx: any) => tx.id === row.reference);
        if (original?.category_id && !original.description) row.description += ` · ${categoryMap.get(original.category_id) ?? 'Uncategorised'}`;
        if (original && original.kind === 'transfer' && Number(original.fee_amount) > 0 && row.type === 'Transfer out') row.description += ` (includes fee ${decimal(minor(String(original.fee_amount)))})`;
      }
    }
    }
  }
  if (statementWallet && statementFrom > statementTo) statement.error = 'The start date must be on or before the end date.';
  return { months: monthRows, topCategories, wallets: walletRows, balances: { USD: decimal(currentBalances.USD), ZIG: decimal(currentBalances.ZIG) }, hasMovement, investmentAnalysis, periodStart: startString.slice(0, 10), statement, statementWallets, loadError: groupsResult.error?.message ?? accountsResult.error?.message ?? categoriesResult.error?.message ?? txResult.error?.message ?? balancesResult.error?.message ?? investmentAccountsResult.error?.message ?? countersResult.error?.message ?? tradesResult.error?.message ?? pricesResult.error?.message ?? forexValuesResult.error?.message ?? investmentMovementsResult.error?.message ?? null };
};
