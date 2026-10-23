<script lang="ts">
  import CashFlowSummary from '$lib/components/CashFlowSummary.svelte';
  import WalletPocket from '$lib/components/WalletPocket.svelte';
  import SpendingRing from '$lib/components/SpendingRing.svelte';
  import CreditCommitments from '$lib/components/CreditCommitments.svelte';
  import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, BarChart3, CircleHelp, CreditCard, Eye, EyeOff, LayoutDashboard, LogOut, Plus, Settings2, Sparkles, WalletCards, Target } from 'lucide-svelte';
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import type { Currency } from '$lib/types/finance';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let balancesVisible = $state(false);
  let spendingCurrency = $state<Currency>('USD');
  const currencies: Currency[] = ['USD', 'ZIG'];
  const money = (amount: string, currency: Currency) => formatMoney(decimalToMinorUnits(String(amount ?? '0')), currency);
  function dateLabel() { return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()); }
  function budgetPercent(goal: PageData['budgetHighlights'][number]) { return Math.round((Number(goal.actual) / Number(goal.amount)) * 100); }
  function progressWidth(goal: PageData['budgetHighlights'][number]) { return Math.max(0, Math.min(100, budgetPercent(goal))); }
  function periodName(period: string) { return ({ week: 'Weekly', month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' } as Record<string, string>)[period] ?? 'Monthly'; }
  function recentAmount(item: PageData['recentActivity'][number]) {
    if (item.kind === 'transfer') return `${money(item.amount, item.source_currency as Currency)} → ${money(String(item.destination_amount ?? item.amount), item.destination_currency as Currency)}`;
    return `${item.kind === 'income' ? '+' : '−'}${money(item.amount, item.source_currency as Currency)}`;
  }
</script>

<svelte:head><title>Overview — Budget</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar">
    <a class="brand" href="/dashboard"><span class="brand-mark"><WalletCards size={21}/></span><span>Budget</span></a>
    <div class="sidebar-label">Workspace</div><a class="side-link active" href="/dashboard"><LayoutDashboard size={18}/> Overview</a>
    <div class="sidebar-label side-label-spaced">Your money</div>
    <a class="side-link" href="/wallets"><CreditCard size={18}/> Wallets <span class="nav-count">{data.groups.length}</span></a>
    <a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a>
    <a class="side-link" href="/investments"><WalletCards size={18}/> Investments</a><a class="side-link" href="/credit"><WalletCards size={18}/> Credit</a><a class="side-link" href="/budgets"><Target size={18}/> Budgets</a>
    <a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a>
    <div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><div class="profile-row"><span class="avatar">{data.email.slice(0, 1).toUpperCase() || 'U'}</span><span class="profile-email">{data.email}</span><form method="POST" action="/logout"><button class="icon-button" aria-label="Sign out" title="Sign out"><LogOut size={17}/></button></form></div></div>
  </aside>
  <main class="main-area">
    <header class="topbar"><div><p class="date-label">{dateLabel()}</p><p class="topbar-title">Your overview</p></div><div class="topbar-actions"><a class="icon-button help-button" href="/insights" aria-label="Open insights" title="Open insights"><CircleHelp size={19}/></a><form method="POST" action="/logout" class="mobile-logout"><button class="icon-button" aria-label="Sign out"><LogOut size={18}/></button></form><a class="add-button" href="/transactions"><Plus size={18}/> Add transaction</a></div></header>
    <div class="content-wrap overview-content">
      <section class="overview-intro"><div><p class="eyebrow">Your money, in view</p><h1>A little clarity.<br/>A lot more possibility<span class="accent-period">.</span></h1><p class="welcome-copy">Here’s your money snapshot for <strong>{data.monthLabel}</strong>.</p></div><a class="overview-shortcut" href="/insights"><span><Sparkles size={16}/></span><span>See your trends</span></a></section>
      {#if !data.databaseReady}<section class="setup-banner" role="status"><div><strong>We couldn’t load your money data</strong><p>{data.errorMessage ?? 'Check the Supabase setup and refresh this page.'}</p></div></section>{/if}
      <div class="balance-section-heading"><h2>Your money at a glance</h2><button class="privacy-toggle" type="button" aria-pressed={balancesVisible} aria-label={balancesVisible ? 'Hide balances' : 'Show balances'} onclick={() => balancesVisible = !balancesVisible}>{#if balancesVisible}<EyeOff size={16}/><span>Hide balances</span>{:else}<Eye size={16}/><span>Show balances</span>{/if}</button></div>
      <section class="dashboard-hero" aria-label="Financial overview">
        <div class="balance-card-grid">
          {#each currencies as currency}
            <article class="balance-card" class:balance-card-zig={currency === 'ZIG'}>
              <div class="balance-card-top"><span class="balance-card-label"><WalletCards size={19}/>All wallets</span><span class="balance-card-currency">{currency === 'USD' ? 'USD' : 'ZiG'}</span></div>
              <div class="balance-card-value"><span>Available balance</span><strong>{balancesVisible ? money(data.summary[currency].balance, currency) : '••••••'}</strong><small>{currency === 'USD' ? 'US dollar' : 'Zimbabwe Gold'} · Active wallets</small></div>
              <div class="balance-card-bottom"><span>Budget<span class="card-brand-dot">.</span></span><span>YOUR EVERYDAY, IN VIEW <Sparkles size={16}/></span></div>
            </article>
          {/each}
          <div class="dashboard-quick-actions" aria-label="Quick actions">
            <a href="/transactions?kind=income#new-transaction"><span class="quick-icon income-quick"><ArrowDownLeft size={22}/></span><span>Add income</span><ArrowUpRight size={15}/></a>
            <a href="/transactions?kind=expense#new-transaction"><span class="quick-icon expense-quick"><ArrowUpRight size={22}/></span><span>Add spending</span><ArrowUpRight size={15}/></a>
            <a href="/transactions?kind=transfer#new-transaction"><span class="quick-icon transfer-quick"><ArrowLeftRight size={22}/></span><span>Transfer</span><ArrowUpRight size={15}/></a>
            <a href="/budgets"><span class="quick-icon budget-quick"><Target size={22}/></span><span>Set a goal</span><ArrowUpRight size={15}/></a>
          </div>
        </div>
        <article class="spending-card"><header><div><p class="eyebrow">A closer look</p><h2>Where it went</h2></div><div class="currency-switch" role="group" aria-label="Spending currency">{#each currencies as currency}<button type="button" class:active={spendingCurrency === currency} aria-pressed={spendingCurrency === currency} onclick={() => spendingCurrency = currency}>{currency === 'USD' ? 'USD' : 'ZiG'}</button>{/each}</div></header><SpendingRing currency={spendingCurrency} total={data.summary[spendingCurrency].spending} categories={data.spendingCategories[spendingCurrency] ?? []}/><a class="spending-details" href="/insights">Explore your spending <ArrowUpRight size={16}/></a></article>
      </section>
      <CashFlowSummary summary={data.summary}/>
      <section id="wallets" class="section-block overview-wallet-section"><div class="section-heading"><div><p class="eyebrow">Your accounts</p><h2>Wallets</h2></div><a class="section-caption" href="/wallets">View wallets →</a></div>
        {#if data.databaseReady && data.groups.length}<div class="pocket-grid">{#each data.groups as group, index (group.id)}<WalletPocket {group} balances={data.balances} visible={balancesVisible} {index}/>{/each}</div>{:else if data.databaseReady}<div class="empty-card"><div class="empty-icon"><WalletCards size={23}/></div><h3>Your wallets are ready</h3><p>Set opening balances or create a project wallet in Settings.</p><a class="primary-button" href="/settings">Open settings</a></div>{:else}<div class="empty-card"><div class="empty-icon"><Settings2 size={23}/></div><h3>Wallets aren’t available yet</h3><p>Once the database setup is connected, your USD and ZiG accounts will appear here.</p></div>{/if}
      </section>
      <CreditCommitments commitments={data.creditCommitments}/>
      <section class="overview-bottom-grid">
        <article class="overview-panel"><div class="section-heading compact"><div><p class="eyebrow">Stay on track</p><h2>Budget progress</h2></div><a class="section-caption" href="/budgets">All budgets →</a></div>{#if data.budgetHighlights.length}<div class="overview-budget-list">{#each data.budgetHighlights as goal}<div class="overview-budget-row"><div class="overview-budget-top"><div><strong>{goal.group_name}</strong><span>{goal.category_name ?? 'Whole wallet'}  | {goal.currency === 'USD' ? 'USD' : 'ZiG'}  | {goal.goal_kind === 'spending_cap' ? 'Spending cap' : goal.goal_kind === 'savings_target' ? 'Savings allocation' : 'Income target'}  |  {periodName(goal.period_type)}</span></div><span class="overview-budget-value">{money(goal.actual, goal.currency as Currency)} <small>/ {money(String(goal.amount), goal.currency as Currency)}</small></span></div><div class="overview-progress"><span class:progress-over={goal.goal_kind === 'spending_cap' && Number(goal.actual) > Number(goal.amount)} style={`width:${progressWidth(goal)}%`}></span></div></div>{/each}</div>{:else}<div class="overview-empty"><span class="metric-icon"><Target size={17}/></span><div><strong>No active targets yet</strong><p>Set a spending cap, income target, or savings goal for a chosen period.</p></div><a href="/investments"><WalletCards size={18}/><span>Investments</span></a><a href="/budgets">Create a budget</a></div>{/if}</article>
        <article id="activity" class="overview-panel"><div class="section-heading compact"><div><p class="eyebrow">Latest movement</p><h2>Recent activity</h2></div><a class="section-caption" href="/transactions">View all →</a></div>{#if data.recentActivity.length}<div class="overview-activity-list">{#each data.recentActivity as item}<div class="overview-activity-row"><span class="activity-icon">{#if item.kind === 'income'}<ArrowDownLeft size={17}/>{:else if item.kind === 'expense'}<ArrowUpRight size={17}/>{:else}<ArrowLeftRight size={17}/>{/if}</span><div class="overview-activity-main"><strong>{item.description || (item.kind === 'income' ? 'Income' : item.kind === 'expense' ? 'Spending' : 'Transfer')}</strong><span>{item.kind === 'transfer' ? item.source_wallet + ' to ' + item.destination_wallet : item.source_wallet + (item.category_name ? ' | ' + item.category_name : '')}</span><small>{new Date(item.occurred_at).toLocaleDateString()}</small></div><div class="overview-activity-amount"><strong class:income-value={item.kind === 'income'} class:expense-value={item.kind === 'expense'}>{recentAmount(item)}</strong>{#if item.kind === 'transfer' && Number(item.fee_amount) > 0}<small>Fee {money(item.fee_amount, item.source_currency as Currency)}</small>{/if}</div></div>{/each}</div>{:else}<div class="overview-empty"><span class="metric-icon"><ArrowLeftRight size={17}/></span><div><strong>No activity yet</strong><p>Your income, spending, and transfers will show here.</p></div><a href="/transactions">Add your first transaction</a></div>{/if}</article>
      </section>
      <footer class="dashboard-footer"><span>USD and ZiG are always tracked separately.</span><span>Personal and project wallets at a glance.</span></footer>
    </div>
  </main>
  
</div>
