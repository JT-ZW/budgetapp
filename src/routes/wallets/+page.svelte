<script lang="ts">
  import Brand from '$lib/components/Brand.svelte';
  import { ArrowLeftRight, BarChart3, CreditCard, LayoutDashboard, LogOut, Plus, Settings2, Target, WalletCards } from 'lucide-svelte';
  import WalletPocket from '$lib/components/WalletPocket.svelte';
  import { Eye, EyeOff } from 'lucide-svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let balancesVisible = $state(false);
</script>

<svelte:head><title>Wallets — Homwe</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar">
    <Brand />
    <div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a>
    <div class="sidebar-label side-label-spaced">Your money</div>
    <a class="side-link active" href="/wallets"><CreditCard size={18}/> Wallets <span class="nav-count">{data.groups.length}</span></a>
    <a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a>
    <a class="side-link" href="/investments"><WalletCards size={18}/> Investments</a><a class="side-link" href="/credit"><WalletCards size={18}/> Credit</a><a class="side-link" href="/budgets"><Target size={18}/> Budgets</a>
    <a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a>
    <div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div>
  </aside>
  <main class="main-area">
    <header class="topbar"><div><p class="date-label">Your accounts</p><p class="topbar-title">Wallets</p></div><div class="topbar-actions"><a class="overview-shortcut" href="/settings">Manage wallets</a><a class="add-button" href="/transactions"><Plus size={17}/> Add transaction</a></div></header>
    <div class="content-wrap overview-content">
      <section class="welcome-row"><div><p class="eyebrow">Your money, organised</p><h1>Wallets<span class="accent-period">.</span></h1><p class="welcome-copy">See your personal payment methods and project balances in one place.</p></div></section>
      {#if data.loadError}<div class="setup-banner"><div><strong>We couldn’t load your wallets</strong><p>{data.loadError}</p></div></div>{/if}
      <div class="balance-section-heading"><h2>Your collection <span class="wallet-collection-count">{data.groups.length}</span></h2><button class="privacy-toggle" type="button" aria-pressed={balancesVisible} onclick={() => balancesVisible = !balancesVisible}>{#if balancesVisible}<EyeOff size={16}/>Hide balances{:else}<Eye size={16}/>Show balances{/if}</button></div>
      {#if data.groups.length}<div class="pocket-grid">{#each data.groups as group, index (group.id)}<WalletPocket {group} balances={data.balances} visible={balancesVisible} {index}/>{/each}</div>{:else}<section class="empty-card wallet-empty"><div class="empty-icon"><WalletCards size={23}/></div><h3>Your wallets are ready to set up</h3><p>Manage your project wallets and opening balances in Settings. Personal wallets are created automatically.</p><a class="primary-button compact-button" href="/settings">Open Settings</a></section>{/if}
      <footer class="dashboard-footer"><span>USD and ZiG are always shown separately.</span><span>Opening balances and recorded activity are reflected here.</span></footer>
    </div>
  </main>
  
</div>
