<script lang="ts">
  import type { Snippet } from 'svelte';
  import Brand from '$lib/components/Brand.svelte';
  import ProjectNavLink from '$lib/components/ProjectNavLink.svelte';
  import { LayoutDashboard, WalletCards, ArrowLeftRight, TrendingUp, CreditCard, Target, BarChart3, Settings2, LogOut } from 'lucide-svelte';
  let { title = 'Projects', children }: { title?: string; children: Snippet } = $props();
</script>
<div class="app-frame">
  <aside class="sidebar"><Brand/><div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a><div class="sidebar-label side-label-spaced">Your money</div><a class="side-link" href="/wallets"><WalletCards size={18}/> Wallets</a><ProjectNavLink/><a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a><a class="side-link" href="/investments"><TrendingUp size={18}/> Investments</a><a class="side-link" href="/credit"><CreditCard size={18}/> Credit</a><a class="side-link" href="/budgets"><Target size={18}/> Budgets</a><a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a><div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div></aside>
  <main class="main-area"><header class="topbar"><div><p class="date-label">Build with a clear view</p><p class="topbar-title">{title}</p></div><a class="overview-shortcut" href="/projects">All projects</a></header><div class="content-wrap project-content">{@render children()}</div></main>
</div>
<style>
  .project-content { padding-bottom: 90px; }
  .topbar>div { min-width: 0; }
  .topbar-title { max-width: min(50vw,600px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
