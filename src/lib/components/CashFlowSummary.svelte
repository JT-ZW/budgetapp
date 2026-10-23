<script lang="ts">
  import { ArrowDownLeft, ArrowUpRight, ArrowRight, Scale } from 'lucide-svelte';
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import type { Currency } from '$lib/types/finance';
  let { summary }: { summary: Record<string, { income: string; spending: string; net: string }> } = $props();
  const currencies: Currency[] = ['USD', 'ZIG'];
  const money = (amount: string, currency: Currency) => formatMoney(decimalToMinorUnits(amount), currency);
  const width = (value: string, income: string, spending: string) => {
    const scale = Math.max(Number(income), Number(spending));
    return scale > 0 ? Math.max(0, Number(value) / scale * 100) : 0;
  };
</script>

<section class="cashflow-summary" aria-labelledby="cashflow-title">
  <header class="cashflow-heading"><div><span class="cashflow-kicker">Monthly cash flow</span><h2 id="cashflow-title">Money in. Money out.</h2></div><Scale size={18} aria-hidden="true"/></header>
  <div class="cashflow-grid">
    {#each currencies as currency}
      {@const values = summary[currency]}
      {@const net = decimalToMinorUnits(values.net)}
      {@const empty = decimalToMinorUnits(values.income) === 0n && decimalToMinorUnits(values.spending) === 0n}
      <article class="flow-card" aria-label={`${currency} monthly cash flow`}>
        <header><span class="flow-currency">{currency === 'ZIG' ? 'ZiG' : currency}</span><span>{currency === 'USD' ? 'US dollar' : 'Zimbabwe Gold'}</span></header>
        <div class="flow-row"><div><span class="flow-icon flow-in"><ArrowDownLeft size={16}/></span><span>Income</span></div><strong>{money(values.income, currency)}</strong></div>
        <div class="flow-track" aria-hidden="true"><span class="flow-in-bar" style={`width:${width(values.income, values.income, values.spending)}%`}></span></div>
        <div class="flow-row"><div><span class="flow-icon flow-out"><ArrowUpRight size={16}/></span><span>Spending</span></div><strong>{money(values.spending, currency)}</strong></div>
        <div class="flow-track" aria-hidden="true"><span class="flow-out-bar" style={`width:${width(values.spending, values.income, values.spending)}%`}></span></div>
        <footer class:flow-negative={net < 0n} class:flow-positive={net > 0n}>
          <div><span>Net movement</span><strong>{net > 0n ? '+' : ''}{money(values.net, currency)}</strong></div>
          <p>{empty ? 'No activity this month' : net < 0n ? 'Spending exceeded income' : net > 0n ? 'Income exceeded spending' : 'Income and spending are balanced'}</p>
        </footer>
      </article>
    {/each}
  </div>
  <a class="cashflow-footnote" href="/insights"><span>Spending includes fees. Opening balances excluded.</span><ArrowRight size={15}/></a>
</section>

<style>
  .cashflow-summary { min-width: 0; margin-top: 30px; }
  .cashflow-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; color: var(--muted); }
  .cashflow-kicker { color: var(--muted); font-size: 10px; font-weight: 550; letter-spacing: .5px; }
  h2 { margin: 5px 0 0; color: var(--ink); font-size: 20px; font-weight: 600; letter-spacing: -.6px; }
  .cashflow-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
  .flow-card { min-width: 0; padding: 20px; border: 1px solid var(--line); border-radius: 19px; background: var(--surface); }
  .flow-card > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 21px; }
  .flow-card > header > span:last-child { color: var(--muted); font-size: 10px; }
  .flow-currency { padding: 5px 9px; border: 1px solid var(--line); border-radius: 7px; color: var(--ink); background: var(--surface-raised); font-size: 10px; font-weight: 700; }
  .flow-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; min-width: 0; }
  .flow-row > div { display: flex; align-items: center; gap: 7px; color: var(--muted); font-size: 11px; }
  .flow-row strong { min-width: 0; max-width: 100%; color: var(--ink); font-size: 16px; font-weight: 600; letter-spacing: -.4px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .flow-icon { display: grid; place-items: center; width: 25px; height: 25px; border-radius: 8px; }
  .flow-in { color: var(--positive); background: var(--positive-soft); }
  .flow-out { color: var(--negative); background: var(--negative-soft); }
  .flow-track { height: 5px; margin: 10px 0 18px; overflow: hidden; border-radius: 9px; background: var(--surface-raised); }
  .flow-track > span { display: block; height: 100%; border-radius: inherit; }
  .flow-in-bar { background: var(--positive); }
  .flow-out-bar { background: var(--negative); }
  .flow-card footer { padding-top: 16px; border-top: 1px solid var(--line); }
  .flow-card footer > div { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 7px; }
  .flow-card footer span { color: var(--muted); font-size: 10px; }
  .flow-card footer strong { max-width: 100%; color: var(--ink); font-size: 18px; font-weight: 600; letter-spacing: -.5px; overflow-wrap: anywhere; }
  .flow-card footer.flow-positive strong { color: var(--positive); }
  .flow-card footer.flow-negative strong { color: var(--negative); }
  .flow-card footer p { margin: 7px 0 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
  .cashflow-footnote { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 2px 0; color: var(--muted); font-size: 10px; line-height: 1.6; text-decoration: none; }
  .cashflow-footnote:hover { color: var(--accent); }
  @media (max-width: 600px) { .cashflow-grid { grid-template-columns: minmax(0,1fr); } }
  @media (max-width: 760px) { .flow-card { padding: 19px; } .flow-row strong { font-size: 18px; } .flow-card footer strong { font-size: 21px; } }
</style>
