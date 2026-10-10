import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

type Row = Record<string, any>;
const n = (value: unknown) => Number(value ?? 0);
const day = (value: unknown) => String(value ?? '').slice(0, 10);
const byDate = (a: Row, b: Row) => day(a.date).localeCompare(day(b.date));

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.supabase) redirect(303, '/');
  const supabase = locals.supabase;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) redirect(303, '/');

  const [accountsResult, countersResult, tradesResult, movementsResult, valuesResult] = await Promise.all([
    supabase.from('budget_app_investment_accounts').select('*').order('created_at'),
    supabase.from('budget_app_investment_counters').select('*').order('company_name'),
    supabase.from('budget_app_investment_trades').select('*').order('occurred_at'),
    supabase.from('budget_app_investment_cash_movements').select('*').order('occurred_at'),
    supabase.from('budget_app_forex_valuations').select('*').order('valuation_date')
  ]);
  const accounts: Row[] = accountsResult.data ?? [];
  const counters: Row[] = countersResult.data ?? [];
  const trades: Row[] = tradesResult.data ?? [];
  const movements: Row[] = movementsResult.data ?? [];
  const valuations: Row[] = valuesResult.data ?? [];
  const counterIds = counters.map((counter) => counter.id);
  const pricesResult = counterIds.length
    ? await supabase.from('budget_app_investment_prices').select('*').in('counter_id', counterIds).order('price_date')
    : { data: [], error: null };
  const prices: Row[] = pricesResult.data ?? [];
  const errors = [accountsResult, countersResult, tradesResult, movementsResult, valuesResult, pricesResult].filter((result: any) => result.error).map((result: any) => result.error.message);
  const today = new Date().toISOString().slice(0, 10);

  const latestPrice = (counterId: string, date: string) => prices.filter((price) => price.counter_id === counterId && day(price.price_date) <= date).at(-1) ?? null;
  const rowsByAccount = (rows: Row[], accountId: string) => rows.filter((row) => row.investment_account_id === accountId);
  const accountPositions = (accountId: string) => counters.filter((counter) => counter.investment_account_id === accountId).map((counter) => {
    const counterTrades = trades.filter((trade) => trade.counter_id === counter.id);
    const buys = counterTrades.filter((trade) => trade.kind === 'buy' || trade.kind === 'opening');
    const sells = counterTrades.filter((trade) => trade.kind === 'sell');
    const quantityBought = buys.reduce((sum, trade) => sum + n(trade.quantity), 0);
    const grossCost = buys.reduce((sum, trade) => sum + n(trade.quantity) * n(trade.unit_price) + n(trade.fees), 0);
    const soldCost = sells.reduce((sum, trade) => sum + n(trade.realized_cost_basis), 0);
    const shares = quantityBought - sells.reduce((sum, trade) => sum + n(trade.quantity), 0);
    const costBasis = grossCost - soldCost;
    const quote = latestPrice(counter.id, today);
    const marketValue = quote ? shares * n(quote.closing_price) : costBasis;
    const unrealized = quote ? marketValue - costBasis : null;
    const realized = sells.reduce((sum, trade) => sum + n(trade.realized_profit), 0);
    const history = prices.filter((price) => price.counter_id === counter.id).map((price) => ({ date: day(price.price_date), value: n(price.closing_price) }));
    return {
      ...counter, shares, quantityBought, costBasis, grossCost, marketValue, unrealized, realized,
      quoteDate: quote ? day(quote.price_date) : null, closingPrice: quote ? n(quote.closing_price) : null,
      trades: counterTrades, history
    };
  });

  const summaries = ['USD', 'ZIG'].map((currency) => {
    const currencyAccounts = accounts.filter((account) => account.currency === currency);
    const rows: Row[] = currencyAccounts.map((account) => {
      const accountMovements = rowsByAccount(movements, account.id);
      const accountTrades = rowsByAccount(trades, account.id);
      const openingCapital = n(account.opening_capital);
      const deposits = accountMovements.filter((movement) => movement.kind === 'deposit').reduce((sum, movement) => sum + n(movement.amount), 0);
      const withdrawals = accountMovements.filter((movement) => movement.kind === 'withdrawal').reduce((sum, movement) => sum + n(movement.amount), 0);
      const openingCost = accountTrades.filter((trade) => trade.kind === 'opening').reduce((sum, trade) => sum + n(trade.quantity) * n(trade.unit_price) + n(trade.fees), 0);
      const netContribution = openingCapital + openingCost + deposits - withdrawals;
      const realized = accountTrades.filter((trade) => trade.kind === 'sell').reduce((sum, trade) => sum + n(trade.realized_profit), 0);
      if (account.kind === 'forex') {
        const daily = rowsByAccount(valuations, account.id).map((value) => ({ date: day(value.valuation_date), value: n(value.closing_equity), note: value.note }));
        const last = daily.at(-1);
        const laterFlows = accountMovements.filter((movement) => !last || day(movement.occurred_at) > last.date).reduce((sum, movement) => sum + (movement.kind === 'deposit' ? n(movement.amount) : -n(movement.amount)), 0);
        const currentValue = (last?.value ?? openingCapital) + laterFlows;
        const gain = currentValue + withdrawals - deposits - openingCapital;
        return { id: account.id, kind: account.kind, name: account.name, currency, value: currentValue, cost: netContribution, netContribution, realized: 0, unrealized: 0, forexGain: gain, gain, returnPercent: netContribution ? gain / netContribution * 100 : null, latestDate: last?.date ?? null, pending: !last, daily };
      }
      const positions = accountPositions(account.id);
      const currentCash = openingCapital + accountMovements.reduce((sum, movement) => sum + (movement.kind === 'deposit' ? n(movement.amount) : -n(movement.amount)), 0) + accountTrades.filter((trade) => trade.kind === 'buy' || trade.kind === 'sell').reduce((sum, trade) => sum + (trade.kind === 'buy' ? -1 : 1) * (n(trade.quantity) * n(trade.unit_price)) - n(trade.fees), 0);
      const positionValue = positions.reduce((sum, position) => sum + (position.shares > 0 ? position.marketValue : 0), 0);
      const unrealized = positions.reduce((sum, position) => sum + (position.shares > 0 ? n(position.unrealized) : 0), 0);
      const totalValue = currentCash + positionValue;
      const gain = totalValue - netContribution;
      return { id: account.id, kind: account.kind, name: account.name, currency, value: totalValue, cost: netContribution, netContribution, realized, unrealized, forexGain: 0, gain, returnPercent: netContribution ? gain / netContribution * 100 : null, latestDate: positions.map((position) => position.quoteDate).filter(Boolean).sort().at(-1) ?? null, pending: positions.some((position) => position.shares > 0 && !position.quoteDate), currentCash, positions, daily: [] };
    });
    const total = (key: string) => rows.reduce((sum, row) => sum + n(row[key]), 0);
    const value = total('value'); const contribution = total('netContribution'); const gain = total('gain');
    return { currency, accounts: rows, value, netContribution: contribution, realized: total('realized'), unrealized: total('unrealized'), forexGain: total('forexGain'), gain, returnPercent: contribution ? gain / contribution * 100 : null };
  });

  const performance = summaries.flatMap((summary) => summary.accounts.flatMap((account: Row) => account.kind === 'forex'
    ? [{ id: account.id, name: account.name, kind: 'Forex', currency: account.currency, value: account.value, cost: account.netContribution, gain: account.gain, returnPercent: account.returnPercent, latestDate: account.latestDate, pending: account.pending }]
    : account.positions.filter((position: Row) => position.shares > 0 || position.quantityBought > 0).map((position: Row) => {
      const gain = position.realized + n(position.unrealized);
      return { id: position.id, name: `${position.ticker} · ${position.company_name}`, kind: 'Stock', currency: account.currency, value: position.marketValue, cost: position.grossCost, gain, returnPercent: position.grossCost ? gain / position.grossCost * 100 : null, latestDate: position.quoteDate, pending: position.unrealized === null, accountName: account.name, position };
    })));

  const allocation = summaries.map((summary) => ({ currency: summary.currency, items: [
    ...summary.accounts.map((account: Row) => ({ id: account.id, label: account.name, kind: account.kind === 'stocks' ? 'Stock account' : 'Forex account', value: account.value })),
    ...summary.accounts.filter((account: Row) => account.kind === 'stocks').flatMap((account: Row) => account.positions.filter((position: Row) => position.shares > 0).map((position: Row) => ({ id: position.id, label: position.ticker, kind: 'Counter', value: position.marketValue })))
  ] }));

  const historyDates = new Set<string>([today]);
  for (const movement of movements) historyDates.add(day(movement.occurred_at));
  for (const trade of trades) historyDates.add(day(trade.occurred_at));
  for (const price of prices) historyDates.add(day(price.price_date));
  for (const value of valuations) historyDates.add(day(value.valuation_date));
  const timeline = [...historyDates].filter(Boolean).sort();
  const growth = ['USD', 'ZIG'].map((currency) => {
    const series = timeline.map((date) => {
      let value = 0; let contribution = 0;
      for (const account of accounts.filter((item) => item.currency === currency)) {
        if (day(account.created_at) > date) continue;
        const accountMovements = rowsByAccount(movements, account.id).filter((movement) => day(movement.occurred_at) <= date);
        const accountTrades = rowsByAccount(trades, account.id).filter((trade) => day(trade.occurred_at) <= date);
        const openingCapital = n(account.opening_capital);
        const deposits = accountMovements.filter((movement) => movement.kind === 'deposit').reduce((sum, movement) => sum + n(movement.amount), 0);
        const withdrawals = accountMovements.filter((movement) => movement.kind === 'withdrawal').reduce((sum, movement) => sum + n(movement.amount), 0);
        if (account.kind === 'forex') {
          const previous = rowsByAccount(valuations, account.id).filter((item) => day(item.valuation_date) <= date).at(-1);
          const base = previous ? n(previous.closing_equity) : openingCapital;
          const postCloseFlows = accountMovements.filter((movement) => (!previous || day(movement.occurred_at) > day(previous.valuation_date)) && day(movement.occurred_at) <= date).reduce((sum, movement) => sum + (movement.kind === 'deposit' ? n(movement.amount) : -n(movement.amount)), 0);
          value += base + postCloseFlows;
          contribution += openingCapital + deposits - withdrawals;
        } else {
          const cash = openingCapital + accountMovements.reduce((sum, movement) => sum + (movement.kind === 'deposit' ? n(movement.amount) : -n(movement.amount)), 0) + accountTrades.filter((trade) => trade.kind === 'buy' || trade.kind === 'sell').reduce((sum, trade) => sum + (trade.kind === 'buy' ? -1 : 1) * (n(trade.quantity) * n(trade.unit_price)) - n(trade.fees), 0);
          const accountCounters = counters.filter((counter) => counter.investment_account_id === account.id);
          const sharesAndCost = accountCounters.reduce((sum, counter) => {
            const related = accountTrades.filter((trade) => trade.counter_id === counter.id);
            const bought = related.filter((trade) => trade.kind === 'buy' || trade.kind === 'opening');
            const sold = related.filter((trade) => trade.kind === 'sell');
            const shares = bought.reduce((total, trade) => total + n(trade.quantity), 0) - sold.reduce((total, trade) => total + n(trade.quantity), 0);
            const cost = bought.reduce((total, trade) => total + n(trade.quantity) * n(trade.unit_price) + n(trade.fees), 0) - sold.reduce((total, trade) => total + n(trade.realized_cost_basis), 0);
            const quote = latestPrice(counter.id, date);
            return sum + (shares > 0 ? quote ? shares * n(quote.closing_price) : cost : 0);
          }, 0);
          value += cash + sharesAndCost;
          contribution += openingCapital + accountTrades.filter((trade) => trade.kind === 'opening').reduce((sum, trade) => sum + n(trade.quantity) * n(trade.unit_price) + n(trade.fees), 0) + deposits - withdrawals;
        }
      }
      return { date, value, contribution };
    });
    return { currency, points: series };
  });

  const forexRisk = summaries.flatMap((summary) => summary.accounts.filter((account: Row) => account.kind === 'forex').map((account: Row) => {
    let nav = 1; let peak = 1; let maxDrawdown = 0;
    const points = account.daily.map((point: Row, index: number) => {
      const previous = account.daily[index - 1];
      const flow = previous ? rowsByAccount(movements, account.id).filter((movement) => day(movement.occurred_at) > previous.date && day(movement.occurred_at) <= point.date).reduce((sum, movement) => sum + (movement.kind === 'deposit' ? n(movement.amount) : -n(movement.amount)), 0) : 0;
      const change = previous ? point.value - previous.value - flow : 0;
      const returnPercent = previous && previous.value !== 0 ? change / previous.value * 100 : null;
      if (returnPercent !== null) nav *= 1 + returnPercent / 100;
      peak = Math.max(peak, nav);
      maxDrawdown = Math.min(maxDrawdown, peak ? (nav / peak - 1) * 100 : 0);
      return { ...point, change, returnPercent, nav };
    });
    const eligible = points.filter((point: Row) => point.returnPercent !== null);
    const best = eligible.length ? [...eligible].sort((a: Row, b: Row) => b.returnPercent - a.returnPercent)[0] : null;
    const worst = eligible.length ? [...eligible].sort((a: Row, b: Row) => a.returnPercent - b.returnPercent)[0] : null;
    return { id: account.id, name: account.name, currency: account.currency, maxDrawdown, best, worst, points };
  }));

  return { accounts, counters, trades, movements, prices, valuations, summaries, performance, allocation, growth, forexRisk, today, loadError: errors[0] ?? null };
};
