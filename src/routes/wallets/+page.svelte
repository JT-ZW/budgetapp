<script lang="ts">
  import { ArrowLeftRight, BarChart3, CreditCard, LayoutDashboard, LogOut, Plus, Settings2, Target, WalletCards } from 'lucide-svelte';
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import type { Currency } from '$lib/types/finance';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const currencies: Currency[] = ['USD', 'ZIG'];
  const channelNames: Record<string, string> = { ecocash: 'EcoCash', bank: 'Bank', cash: 'Cash' };
  const money = (value: string, currency: Currency) => formatMoney(decimalToMinorUnits(value), currency);
  function total(accounts: { id: string; opening_balance: string }[], currency: Currency) {
    return formatMoney(accounts.reduce((sum, account) => sum + decimalToMinorUnits(data.balances[account.id] ?? account.opening_balance), 0n), currency);
  }
</script>

<svelte:head><title>Wallets — Budget</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar">
    <a class="brand" href="/dashboard"><span class="brand-mark"><WalletCards size={21}/></span><span>Budget</span></a>
    <div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a>
    <div class="sidebar-label side-label-spaced">Your money</div>
    <a class="side-link active" href="/wallets"><CreditCard size={18}/> Wallets <span class="nav-count">{data.groups.length}</span></a>
    <a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a>
    <a class="side-link" href="/budgets"><Target size={18}/> Budgets</a>
    <a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a>
    <div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div>
  </aside>
  <main class="main-area">
    <header class="topbar"><div><p class="date-label">Your accounts</p><p class="topbar-title">Wallets</p></div><div class="topbar-actions"><a class="overview-shortcut" href="/settings">Manage wallets</a><a class="add-button" href="/transactions"><Plus size={17}/> Add transaction</a></div></header>
    <div class="content-wrap overview-content">
      <section class="welcome-row"><div><p class="eyebrow">Your money, organised</p><h1>Wallets<span class="accent-period">.</span></h1><p class="welcome-copy">See your personal payment methods and project balances in one place.</p></div></section>
      {#if data.loadError}<div class="setup-banner"><div><strong>We couldn’t load your wallets</strong><p>{data.loadError}</p></div></div>{/if}
      {#if data.groups.length}<div class="wallet-page-grid">{#each data.groups as group}<article class="overview-wallet-card wallet-page-card" class:personal-wallet-card={group.kind === 'personal'}><div class="overview-wallet-head"><span class="wallet-icon"><WalletCards size={17}/></span><span class="wallet-kind">{group.kind === 'personal' ? 'Personal wallet' : 'Project wallet'}</span><a href="/settings" aria-label={`Edit ${group.name}`} class="wallet-edit-link">Edit wallet</a></div><h2>{group.name}</h2><div class="overview-wallet-currencies">{#each currencies.filter((currency) => group.wallet_accounts.some((account: any) => account.currency === currency)) as currency}<div class="overview-currency-block"><div class="overview-currency-total"><span class="currency-badge" class:zig-badge={currency === 'ZIG'}>{currency === 'USD' ? 'USD' : 'ZiG'}</span><strong>{total(group.wallet_accounts.filter((account: any) => account.currency === currency), currency)}</strong></div>{#if group.kind === 'personal'}<div class="overview-subwallets">{#each group.wallet_accounts.filter((account: any) => account.currency === currency) as account}<div><span>{channelNames[account.channel ?? ''] ?? 'Account'}</span><span>{money(data.balances[account.id] ?? account.opening_balance, currency)}</span></div>{/each}</div>{:else}<p class="project-currency-note">Project balance</p>{/if}</div>{/each}</div></article>{/each}</div>{:else}<section class="empty-card wallet-empty"><div class="empty-icon"><WalletCards size={23}/></div><h3>Your wallets are ready to set up</h3><p>Manage your project wallets and opening balances in Settings. Personal wallets are created automatically.</p><a class="primary-button compact-button" href="/settings">Open Settings</a></section>{/if}
      <footer class="dashboard-footer"><span>USD and ZiG are always shown separately.</span><span>Opening balances and recorded activity are reflected here.</span></footer>
    </div>
  </main>
  <nav class="mobile-nav" aria-label="Main navigation"><a href="/dashboard"><LayoutDashboard size={18}/><span>Overview</span></a><a class="mobile-nav-active" href="/wallets"><CreditCard size={18}/><span>Wallets</span></a><a href="/transactions"><ArrowLeftRight size={18}/><span>Activity</span></a><a href="/budgets"><Target size={18}/><span>Budgets</span></a><a href="/insights"><BarChart3 size={18}/><span>Insights</span></a><a href="/settings"><Settings2 size={18}/><span>Settings</span></a></nav>
</div>
