<script lang="ts">
  import { ArrowLeftRight, BarChart3, LayoutDashboard, LogOut, Plus, Settings2, WalletCards, Target, Trash2 } from 'lucide-svelte';
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import { enhance } from '$app/forms';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  import type { Currency } from '$lib/types/finance';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
  let goalKind = $state('spending_cap');
  let periodType = $state('month');
  const label = (target: PageData['targets'][number]) => `${target.group_name} · ${target.category_name ?? 'Whole wallet'} · ${target.currency}`;
  const moneyLabel = (value: string, currency: Currency) => formatMoney(decimalToMinorUnits(value), currency);
  const percentUsed = (target: PageData['targets'][number]) => Math.round(Number(target.actual) / Number(target.amount) * 100);
  const progressWidth = (target: PageData['targets'][number]) => Math.max(0, Math.min(100, percentUsed(target)));
  const periodName = (period: string) => ({ week: 'This week', month: 'This month', quarter: 'This quarter', year: 'This year' }[period] ?? 'This period');
</script>

<svelte:head><title>Budgets & targets — Budget</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar"><a class="brand" href="/dashboard"><span class="brand-mark"><WalletCards size={21}/></span><span>Budget</span></a><div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a><div class="sidebar-label side-label-spaced">Your money</div><a class="side-link" href="/wallets"><WalletCards size={18}/> Wallets</a><a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a><a class="side-link" href="/investments"><WalletCards size={18}/> Investments</a><a class="side-link active" href="/budgets"><Target size={18}/> Budgets</a><a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a><div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div></aside>
  <main class="main-area">
    <header class="topbar"><div><p class="date-label">Flexible plan</p><p class="topbar-title">Budgets & targets</p></div></header>
    <div class="content-wrap">
      <section class="welcome-row"><div><p class="eyebrow">A plan that fits</p><h1>Set goals, <span class="accent-period">see progress.</span></h1><p class="welcome-copy">Track spending caps, income goals, and savings allocations over a week, month, quarter, or year.</p></div><div class="currency-note">USD and ZiG tracked separately</div></section>
      {#if data.loadError}<div class="setup-banner"><div><strong>We couldn’t load your targets</strong><p>{data.loadError}. Run the latest Supabase migration, then refresh.</p></div></div>{/if}
      {#if form?.message}<p class="form-alert" role="alert">{form.message}</p>{/if}
      <section class="section-block"><div class="section-heading"><div><p class="eyebrow">Create a target</p><h2>What do you want to track?</h2></div></div>
        <form method="POST" action="?/save" class="feature-form" use:enhance={handleInvestmentSubmit}>
          <label>Wallet<select name="wallet_group_id" required><option value="" disabled selected>Choose a wallet</option>{#each data.groups as group}<option value={group.id}>{group.name} · {group.kind === 'personal' ? 'Personal' : 'Project'}</option>{/each}</select></label>
          <label>Currency<select name="currency"><option value="USD">USD</option><option value="ZIG">ZiG</option></select></label>
          <label>Goal<select name="goal_kind" bind:value={goalKind}><option value="spending_cap">Spending cap</option><option value="income_target">Income target</option><option value="savings_target">Savings allocation</option></select></label>
          <label>Timeline<select name="period_type" bind:value={periodType}><option value="week">Weekly</option><option value="month">Monthly</option><option value="quarter">Quarterly</option><option value="year">Yearly</option></select></label>
          {#if goalKind === 'savings_target'}
            <div class="savings-guidance"><strong>Use a dedicated project wallet as your savings pot.</strong><span>Create one in Settings, then transfer money into it. Transfers in count toward this target; transfers out reduce it.</span></div>
          {:else}
            <label>Category (optional)<select name="category_id"><option value="">Whole wallet</option>{#each data.categories.filter((category) => category.kind === (goalKind === 'income_target' ? 'income' : 'expense')) as category}<option value={category.id}>{category.name}</option>{/each}</select></label>
          {/if}
          <label>Target amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required/></label>
          <div class="form-footer"><p>Each target tracks one wallet, currency, and time period.</p><button class="primary-button" type="submit"><Plus size={17}/> Save target</button></div>
        </form>
      </section>
      <section class="section-block"><div class="section-heading"><div><p class="eyebrow">Active periods</p><h2>Your targets</h2></div><span class="section-caption">Spending includes transfer fees · savings tracks net allocations</span></div>
        {#if data.targets.length}
          <div class="target-grid">{#each data.targets as target}<article class="target-card"><div class="target-top"><span class="target-icon"><Target size={18}/></span><span class="target-type">{target.goal_kind === 'spending_cap' ? 'Spending cap' : target.goal_kind === 'income_target' ? 'Income target' : 'Savings allocation'} · {target.period_type}</span><form method="POST" action="?/remove" use:enhance={handleInvestmentSubmit}><input type="hidden" name="id" value={target.id}/><button class="icon-button" aria-label="Remove target" title="Remove target"><Trash2 size={16}/></button></form></div><h3>{label(target)}</h3><div class="target-values"><strong>{moneyLabel(target.actual, target.currency as Currency)}</strong><span>of {moneyLabel(String(target.amount), target.currency as Currency)}</span></div><div class="progress-track"><span class:over-limit={target.goal_kind === 'spending_cap' && Number(target.actual) > Number(target.amount)} style={`width:${progressWidth(target)}%`}></span></div><p class="target-foot">{percentUsed(target)}% {target.goal_kind === 'spending_cap' ? 'of cap used' : target.goal_kind === 'savings_target' ? 'of savings allocated' : 'of income target reached'} · {periodName(target.period_type)}</p></article>{/each}</div>
        {:else}<div class="empty-card"><div class="empty-icon"><Target size={23}/></div><h3>No active targets in this period</h3><p>Create a weekly, monthly, quarterly, or yearly spending, income, or savings target.</p></div>{/if}
      </section>
    </div>
  </main>
  <nav class="mobile-nav" aria-label="Main navigation"><a href="/dashboard"><LayoutDashboard size={18}/><span>Overview</span></a><a href="/wallets"><WalletCards size={18}/><span>Wallets</span></a><a href="/transactions"><ArrowLeftRight size={18}/><span>Activity</span></a><a class="mobile-nav-active" href="/budgets"><Target size={18}/><span>Budgets</span></a><a href="/insights"><BarChart3 size={18}/><span>Insights</span></a><a href="/settings"><Settings2 size={18}/><span>Settings</span></a></nav>
</div>
