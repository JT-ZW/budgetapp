<script lang="ts">
  import ProjectNavLink from '$lib/components/ProjectNavLink.svelte';
  import ShortcutForm from '$lib/components/ShortcutForm.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import { ArrowLeftRight, BarChart3, LayoutDashboard, LogOut, Plus, Settings2, WalletCards, ArchiveRestore, FolderKanban, Tags, BusFront, Zap, ArrowDownLeft, Pencil, Trash2 } from 'lucide-svelte';
  import { enhance } from '$app/forms';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const channelLabels: Record<string, string> = { ecocash: 'EcoCash', bank: 'Bank', cash: 'Cash' };
</script>
<svelte:head><title>Settings — Homwe</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar"><Brand /><div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a><div class="sidebar-label side-label-spaced">Your money</div><a class="side-link" href="/wallets"><WalletCards size={18}/> Wallets</a><ProjectNavLink/><a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a><a class="side-link" href="/investments"><WalletCards size={18}/> Investments</a><a class="side-link" href="/credit"><WalletCards size={18}/> Credit</a><a class="side-link" href="/budgets"><WalletCards size={18}/> Budgets</a><a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a><div class="sidebar-bottom"><a class="side-link active" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div></aside>
  <main class="main-area"><header class="topbar"><div><p class="date-label">Your setup</p><p class="topbar-title">Settings</p></div></header>
    <div class="content-wrap"><section class="welcome-row"><div><p class="eyebrow">Make it yours</p><h1>Set up your <span class="accent-period">money space.</span></h1><p class="welcome-copy">Create project wallets and the categories you use to organise activity.</p></div></section>
      {#if data.loadError}<div class="setup-banner"><div><strong>Database setup needed</strong><p>{data.loadError}. Run the setup SQL in Supabase, then refresh.</p></div></div>{/if}{#if form?.message}<p class="form-alert" role="alert">{form.message}</p>{/if}
      <section class="section-block" id="transaction-shortcuts">
        <div class="section-heading"><div><p class="eyebrow">Quick entry</p><h2>Transaction shortcuts</h2><p class="section-caption">Save your regular payments, then tap and confirm them on Transactions.</p></div><a href="/transactions#quick-entry">Go to quick entry</a></div>
        {#if data.shortcutError}<p class="form-alert" role="alert">{data.shortcutError}</p>{:else}
          <ShortcutForm accounts={data.accounts} categories={data.categories}/>
          <div class="saved-shortcuts">{#each data.shortcuts as shortcut (shortcut.id)}
            {@const account = data.accounts.find((row) => row.id === shortcut.account_id)}
            <article class="shortcut-setting" aria-label={shortcut.name}>
              <div class="shortcut-summary">
                <span class="shortcut-icon" aria-hidden="true">{#if /transport|bus|taxi|commute|work|fuel/i.test(shortcut.name)}<BusFront size={23} strokeWidth={1.8}/>{:else if shortcut.kind === 'income'}<ArrowDownLeft size={23} strokeWidth={1.8}/>{:else}<Zap size={23} strokeWidth={1.8}/>{/if}</span>
                <div class="shortcut-description"><h3>{shortcut.name}</h3><p>{data.categories.find((category) => category.id === shortcut.category_id)?.name ?? 'Category unavailable'}</p><small>{account ? [account.group_name, account.currency === 'ZIG' ? 'ZiG' : account.currency, channelLabels[account.channel ?? '']].filter(Boolean).join(' / ') : 'Wallet unavailable - edit this shortcut'}</small></div>
                <div class="shortcut-value"><strong>{account?.currency === 'ZIG' ? 'ZiG' : account?.currency ?? ''} {Number(shortcut.amount).toFixed(2)}</strong><span>{shortcut.kind === 'income' ? 'Income' : 'Spending'}</span></div>
              </div>
              <div class="shortcut-controls">
                <details><summary><Pencil size={15} aria-hidden="true"/> Edit shortcut</summary><div class="shortcut-editor"><ShortcutForm accounts={data.accounts} categories={data.categories} {shortcut}/></div></details>
                <form method="POST" action="?/deleteShortcut" use:enhance={handleInvestmentSubmit}><input type="hidden" name="id" value={shortcut.id}/><button class="shortcut-delete" type="submit" aria-label={'Delete shortcut ' + shortcut.name}><Trash2 size={15} aria-hidden="true"/> Delete</button></form>
              </div>
            </article>
          {:else}<p class="list-empty">Create your first shortcut above, such as transport to work or transport home.</p>{/each}</div>
        {/if}
      </section>
      <section class="settings-grid">
        <article class="feature-card"><div class="feature-title"><span class="wallet-icon"><FolderKanban size={18}/></span><div><p class="eyebrow">Project accounts</p><h2>Project wallets</h2></div></div><p class="feature-copy">Name each project and choose whether it tracks USD, ZiG, or both.</p>
          <form method="POST" action="?/createProject" class="settings-form" use:enhance={handleInvestmentSubmit}><label class="settings-field">Wallet name<input name="name" maxlength="80" placeholder="e.g. Garden project" required/></label><fieldset class="currency-choice"><legend>Track currencies</legend><label><input type="checkbox" name="currencies" value="USD" checked/> USD</label><label><input type="checkbox" name="currencies" value="ZIG" checked/> ZiG</label></fieldset><button class="primary-button compact-button" type="submit"><Plus size={16}/> Create wallet</button></form>
          <div class="settings-list wallet-settings-list">{#each data.groups.filter((group) => group.kind === 'project') as group}<div class="project-setting-row"><div class="project-setting-summary"><div><strong>{group.name}</strong><span>{group.archived_at ? 'Archived' : 'Active'} · {group.currencies.length ? group.currencies.map((currency: string) => currency === 'USD' ? 'USD' : 'ZiG').join(' + ') : 'No active currencies'}</span></div><div class="project-row-actions"><details class="wallet-edit"><summary>Edit</summary><form method="POST" action="?/updateProject" class="wallet-edit-form" use:enhance={handleInvestmentSubmit}><input type="hidden" name="id" value={group.id}/><label class="settings-field">Wallet name<input name="name" maxlength="80" value={group.name} required/></label><fieldset class="currency-choice"><legend>Active currencies</legend><label><input type="checkbox" name="currencies" value="USD" checked={group.currencies.includes('USD')}/> USD</label><label><input type="checkbox" name="currencies" value="ZIG" checked={group.currencies.includes('ZIG')}/> ZiG</label></fieldset><button class="primary-button compact-button" type="submit">Save changes</button><p class="form-hint">Removed currencies are archived with their transaction history preserved.</p></form></details><form method="POST" action="?/setProjectArchive" use:enhance={handleInvestmentSubmit}><input type="hidden" name="id" value={group.id}/><input type="hidden" name="archived" value={group.archived_at ? 'false' : 'true'}/><button class="text-button" type="submit">{#if group.archived_at}<ArchiveRestore size={16}/> Restore{:else}<ArchiveRestore size={16}/> Archive{/if}</button></form></div></div></div>{/each}{#if !data.groups.some((group) => group.kind === 'project')}<p class="list-empty">Your project wallets will show here.</p>{/if}</div>
        </article>
        <article class="feature-card"><div class="feature-title"><span class="wallet-icon"><Tags size={18}/></span><div><p class="eyebrow">Transaction labels</p><h2>Categories</h2></div></div><p class="feature-copy">Keep income and spending categories separate for clearer budgets and reports.</p>
          <form method="POST" action="?/createCategory" class="settings-form category-form" use:enhance={handleInvestmentSubmit}><label class="settings-field">Category name<input id="category-name" name="name" maxlength="60" placeholder="e.g. Transport" required/></label><label class="settings-field">Category type<select name="kind"><option value="expense">Spending</option><option value="income">Income</option></select></label><button class="primary-button compact-button" type="submit"><Plus size={16}/> Add category</button></form>
          <div class="settings-list">{#each data.categories as category}<div class="settings-row"><div><strong>{category.name}</strong><span>{category.kind === 'income' ? 'Income' : 'Spending'}</span></div><span class="category-chip">{category.kind === 'income' ? 'IN' : 'OUT'}</span></div>{/each}{#if !data.categories.length}<p class="list-empty">Add categories for your transactions.</p>{/if}</div>
        </article>
      </section>
      <section class="section-block"><div class="section-heading"><div><p class="eyebrow">Starting point</p><h2>Opening balances</h2></div><span class="section-caption">Set what is already in each wallet</span></div><div class="opening-list">{#each data.accounts as account}<form method="POST" action="?/setOpeningBalance" class="opening-row" use:enhance={handleInvestmentSubmit}><input type="hidden" name="id" value={account.id}/><div><strong>{account.group_name} · {account.currency === 'USD' ? 'USD' : 'ZiG'}</strong><span>{account.group_kind === 'personal' ? (channelLabels[account.channel ?? ''] ?? 'Personal') : 'Project balance'}</span></div><label><span class="sr-only">Opening balance</span><input name="opening_balance" type="number" min="0" step="0.01" inputmode="decimal" value={account.opening_balance} required/></label><button class="primary-button compact-button" type="submit">Save</button></form>{/each}</div></section>
      <section class="personal-note"><span class="wallet-icon"><WalletCards size={18}/></span><div><strong>Personal wallet</strong><p>Personal is created automatically with EcoCash, Bank, and Cash sub-wallets in USD and ZiG. Those balances roll up to your Personal wallet.</p></div></section>
    </div>
  </main>
  
</div>

<style>
.saved-shortcuts { display: grid; gap: 1rem; margin-top: 1.5rem; }
.shortcut-setting { border: 1px solid var(--line); border-radius: 16px; background: var(--surface, #fff); overflow: hidden; }
.shortcut-summary { display: flex; align-items: center; gap: 1rem; padding: 1.25rem; }
.shortcut-icon { display: grid; place-items: center; flex: 0 0 48px; height: 48px; border-radius: 12px; color: var(--accent, #17493b); background: var(--accent-soft, #e9f0e8); }
.shortcut-description { flex: 1; min-width: 0; }
.shortcut-description h3 { margin: 0; font-size: 1rem; line-height: 1.4; overflow-wrap: anywhere; }
.shortcut-description p { margin: .3rem 0; color: var(--muted); font-size: .8rem; }
.shortcut-description small { color: var(--muted); font-size: .75rem; overflow-wrap: anywhere; }
.shortcut-value { display: flex; flex-direction: column; gap: .35rem; text-align: right; }
.shortcut-value strong { font-size: 1.2rem; color: var(--ink); }
.shortcut-value span { font-size: .7rem; color: var(--muted); }
.shortcut-controls { display: grid; grid-template-columns: 1fr auto; gap: .75rem; align-items: start; padding: .85rem 1.25rem; border-top: 1px solid var(--line); }
.shortcut-controls details { min-width: 0; }
.shortcut-controls details[open] { grid-column: 1 / -1; }
.shortcut-controls summary, .shortcut-delete { display: inline-flex; align-items: center; justify-content: center; gap: .5rem; min-height: 40px; padding: .6rem .9rem; border: 1px solid var(--line); border-radius: 9px; font-size: .8rem; font-weight: 650; cursor: pointer; }
.shortcut-controls summary { list-style: none; color: var(--accent, #17493b); background: var(--accent-soft, #e9f0e8); }
.shortcut-controls summary::-webkit-details-marker { display: none; }
.shortcut-controls summary:hover { border-color: var(--accent, #17493b); }
.shortcut-controls summary:focus-visible { outline: 3px solid var(--accent, #42785a); outline-offset: 3px; }
.shortcut-delete { background: transparent; color: var(--negative, #a33333); }
.shortcut-delete:hover { background: var(--negative-soft, #fff0ee); border-color: var(--negative, #a33333); }
.shortcut-controls form { margin: 0; justify-self: end; }
.shortcut-editor { margin-top: 1rem; }
@media (max-width: 540px) {
  .shortcut-summary { flex-wrap: wrap; padding: 1rem; gap: .75rem; }
  .shortcut-value { flex-basis: 100%; padding-left: 60px; text-align: left; }
  .shortcut-controls { padding: .8rem 1rem; }
}
</style>
