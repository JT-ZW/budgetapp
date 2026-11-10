<script lang="ts">
  import ProjectNavLink from '$lib/components/ProjectNavLink.svelte';
  import DatePicker from '$lib/components/DatePicker.svelte';
  import Brand from '$lib/components/Brand.svelte';
  import { ArrowLeftRight, BarChart3, LayoutDashboard, LogOut, Plus, Settings2, WalletCards, ArrowDownLeft, ArrowUpRight, BusFront, Zap, ChevronRight } from 'lucide-svelte';
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  import type { SubmitFunction } from '@sveltejs/kit';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  let confirmation: HTMLDialogElement;
  let selectedShortcut = $state<string | null>(null);
  let shortcutRequestId = $state('');
  let shortcutDate = $state('');
  let shortcutPending = $state(false);
  const selected = $derived(data.shortcuts.find((shortcut) => shortcut.id === selectedShortcut));
  const shortcutAvailable = (accountId: string) => data.accounts.some((account) => account.id === accountId && !account.archived_at);
  const confirmShortcut: SubmitFunction = (input) => {
    if (shortcutPending) { input.cancel(); return; }
    shortcutPending = true;
    const finish = handleInvestmentSubmit(input);
    return async (result) => {
      try {
        if (typeof finish === 'function') await finish(result);
        if (result.result.type === 'success' || result.result.type === 'redirect') confirmation.close();
      } finally { shortcutPending = false; }
    };
  };
  function selectShortcut(id: string) {
    selectedShortcut = id;
    shortcutRequestId = crypto.randomUUID();
    const today = new Date();
    shortcutDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
    confirmation.showModal();
  }
  let kind = $state('expense');
  $effect(() => {
    const requestedKind = page.url.searchParams.get('kind');
    if (requestedKind && ['income', 'expense', 'transfer'].includes(requestedKind)) kind = requestedKind;
  });
  let walletGroupId = $state('');
  let accountId = $state('');
  let destinationGroupId = $state('');
  let destinationAccountId = $state('');
  let dateToday = new Date().toISOString().slice(0, 10);
  const sourceAccounts = $derived(data.accounts.filter((account) => !account.archived_at && account.wallet_group_id === walletGroupId));
  const destinationAccounts = $derived(data.accounts.filter((account) => !account.archived_at && account.wallet_group_id === destinationGroupId && account.id !== accountId));
  const accountLabel = (id: string) => {
    const account = data.accounts.find((row) => row.id === id);
    const group = data.groups.find((row) => row.id === account?.wallet_group_id);
    return `${group?.name ?? 'Wallet'}  | ${account?.currency ?? ''}${account?.channel ? `  | ${account.channel}` : ''}`;
  };
  const categoryLabel = (id: string | null) => data.categories.find((row) => row.id === id)?.name ?? 'Uncategorised';
  const historyPageHref = (page: number) => { const params = new URLSearchParams({ page: String(page) }); if (data.walletFilter) params.set('wallet', data.walletFilter); return `?${params.toString()}#transaction-history`; };
</script>
<svelte:head><title>Transactions — Homwe</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar"><Brand /><div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a><div class="sidebar-label side-label-spaced">Your money</div><a class="side-link" href="/wallets"><WalletCards size={18}/> Wallets</a><ProjectNavLink/><a class="side-link active" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a><a class="side-link" href="/investments"><WalletCards size={18}/> Investments</a><a class="side-link" href="/credit"><WalletCards size={18}/> Credit</a><a class="side-link" href="/budgets"><WalletCards size={18}/> Budgets</a><a class="side-link" href="/insights"><BarChart3 size={18}/> Insights</a><div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div></aside>
  <main class="main-area"><header class="topbar"><div><p class="date-label">Your money, clearly</p><p class="topbar-title">Transactions</p></div><a class="add-button" href="#new-transaction"><Plus size={18}/> Add transaction</a></header>
    <div class="content-wrap"><section class="welcome-row"><div><p class="eyebrow">Ledger</p><h1>Every move, <span class="accent-period">accounted for.</span></h1><p class="welcome-copy">Record income, spending, and transfers between your wallets.</p></div></section>
      {#if data.loadError}<div class="setup-banner"><div><strong>Database setup needed</strong><p>{data.loadError}. Run the setup SQL in Supabase, then refresh.</p></div></div>{/if}
      {#if form?.message}<p class="form-alert" role="alert">{form.message}</p>{/if}
      <section class="section-block" id="quick-entry">
        <div class="section-heading"><div><p class="eyebrow">Your regulars</p><h2>Quick entry</h2><p class="section-caption">Choose a shortcut, then confirm to record it.</p></div><a href="/settings#transaction-shortcuts">Manage shortcuts</a></div>
        {#if data.shortcutError}<p class="form-alert">{data.shortcutError}</p>{:else}
          <div class="shortcut-buttons">{#each data.shortcuts as shortcut (shortcut.id)}
            <button type="button" class="shortcut-button" disabled={!shortcutAvailable(shortcut.account_id)} onclick={() => selectShortcut(shortcut.id)} aria-label={'Record ' + shortcut.name + ', ' + (data.accounts.find((account) => account.id === shortcut.account_id)?.currency ?? '') + ' ' + Number(shortcut.amount).toFixed(2)}>
              <span class="shortcut-icon" aria-hidden="true">{#if /transport|bus|taxi|commute|work|fuel/i.test(shortcut.name)}<BusFront size={23} strokeWidth={1.8}/>{:else if shortcut.kind === 'income'}<ArrowDownLeft size={23} strokeWidth={1.8}/>{:else}<Zap size={23} strokeWidth={1.8}/>{/if}</span>
              <span class="shortcut-content"><strong>{shortcut.name}</strong><span class="shortcut-amount">{data.accounts.find((account) => account.id === shortcut.account_id)?.currency ?? ''} {Number(shortcut.amount).toFixed(2)}<span class="shortcut-kind">{shortcut.kind === 'income' ? 'Income' : 'Spending'}</span></span><small>{shortcutAvailable(shortcut.account_id) ? accountLabel(shortcut.account_id) : 'Wallet unavailable - update in Settings'}</small></span>
              <span class="shortcut-action" aria-hidden="true"><ChevronRight size={19}/></span>
            </button>
          {:else}<p class="section-caption">Save regular payments like transport in <a href="/settings#transaction-shortcuts">Settings</a> to record them here in two taps.</p>{/each}</div>
        {/if}
      </section>
      <dialog bind:this={confirmation} class="shortcut-dialog" oncancel={(event) => { if (shortcutPending) event.preventDefault(); }} aria-labelledby="shortcut-confirm-title">
        {#if selected}<h2 id="shortcut-confirm-title">Record {selected.name}?</h2><p>{selected.kind === 'income' ? 'Income' : 'Spending'} | {data.accounts.find((account) => account.id === selected.account_id)?.currency} {selected.amount}</p><p>{accountLabel(selected.account_id)}</p><p>{categoryLabel(selected.category_id)}</p>
        <form method="POST" action="?/create" use:enhance={confirmShortcut}>
          <input type="hidden" name="shortcut_id" value={selected.id}/><input type="hidden" name="shortcut_request_id" value={shortcutRequestId}/>
          <label>Date<DatePicker name="occurred_on" bind:value={shortcutDate} required disabled={shortcutPending}/></label>
          {#if form?.message}<p class="form-alert" role="alert">{form.message}</p>{/if}
          <div class="confirm-actions"><button class="text-button" type="button" disabled={shortcutPending} onclick={() => confirmation.close()}>Cancel</button><button class="primary-button" type="submit" disabled={shortcutPending}>{shortcutPending ? 'Recording...' : 'Confirm transaction'}</button></div>
        </form>{/if}
      </dialog>
      <section class="section-block transaction-entry-section"><div class="section-heading"><div><p class="eyebrow">New entry</p><h2>Record a transaction</h2><p class="section-caption">Add a movement to the right wallet in a few steps.</p></div></div>
        <form id="new-transaction" method="POST" action="?/create" class="feature-form" use:enhance={handleInvestmentSubmit}>
          <label>Type<select name="kind" bind:value={kind}><option value="expense">Spending</option><option value="income">Income</option><option value="transfer">Transfer</option></select></label>
          <label>From wallet<select value={walletGroupId} onchange={(event) => { walletGroupId = event.currentTarget.value; accountId = ''; }} required><option value="" disabled>Choose a wallet</option>{#each data.groups as group}<option value={group.id}>{group.name}</option>{/each}</select></label>
          <label>From account<select name="account_id" bind:value={accountId} required disabled={!walletGroupId}><option value="" disabled>Choose a currency or sub-wallet</option>{#each sourceAccounts as account}<option value={account.id}>{account.currency === 'USD' ? 'USD' : 'ZiG'}{account.channel ? `  | ${account.channel === 'ecocash' ? 'EcoCash' : account.channel === 'bank' ? 'Bank' : 'Cash'}` : ''}</option>{/each}</select></label>
          {#if kind === 'transfer'}<label>To wallet<select value={destinationGroupId} onchange={(event) => { destinationGroupId = event.currentTarget.value; destinationAccountId = ''; }} required><option value="" disabled>Choose destination wallet</option>{#each data.groups as group}<option value={group.id}>{group.name}</option>{/each}</select></label><label>To account<select name="destination_account_id" bind:value={destinationAccountId} required disabled={!destinationGroupId}><option value="" disabled>Choose a currency or sub-wallet</option>{#each destinationAccounts as account}<option value={account.id}>{account.currency === 'USD' ? 'USD' : 'ZiG'}{account.channel ? `  | ${account.channel === 'ecocash' ? 'EcoCash' : account.channel === 'bank' ? 'Bank' : 'Cash'}` : ''}</option>{/each}</select></label>{/if}
          <label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required/></label>
          {#if kind === 'transfer'}<label>Amount received (for another currency)<input name="destination_amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="Only for cross-currency transfers"/></label><label>Exchange rate<input name="exchange_rate" type="number" min="0.0000000001" step="any" inputmode="decimal" placeholder="Only for cross-currency transfers"/></label><label>Transfer fee<input name="fee_amount" type="number" min="0" step="0.01" inputmode="decimal" value="0"/></label>{/if}
          <label>Category<select name="category_id" required={kind !== 'transfer'}><option value="">{kind === 'transfer' ? 'No fee category' : 'Choose a category'}</option>{#each data.categories.filter((category) => kind === 'income' ? category.kind === 'income' : category.kind === 'expense') as category}<option value={category.id}>{category.name}{kind === 'transfer' ? '  | fee' : ''}</option>{/each}</select></label>
          <label>Date<DatePicker name="occurred_on" value={dateToday} required/></label>
          <label class="form-wide">Note<input name="description" maxlength="240" placeholder="What was this for?"/></label>
          <div class="form-wide form-footer"><p>Amounts stay in the selected wallet’s currency.</p><button class="primary-button" type="submit"><Plus size={17}/> Save transaction</button></div>
        </form>
      </section>
      {#if data.investmentMovements.length}<section class="section-block investment-ledger-section"><div class="section-heading"><div><p class="eyebrow">Linked wallet transfers</p><h2>Investment funding</h2><p class="section-caption">These move money between your personal wallets and investment accounts; they are not income or spending.</p></div></div><div class="ledger-table-wrap"><table class="ledger-table"><thead><tr><th>Movement</th><th>Wallet</th><th>Investment account</th><th>Date</th><th class="amount-cell">Amount</th></tr></thead><tbody>{#each data.investmentMovements as movement}<tr><td><div class="ledger-title"><span class="transaction-icon transfer-icon">{#if movement.kind === 'deposit'}<ArrowUpRight size={16}/>{:else}<ArrowDownLeft size={16}/>{/if}</span><div><strong>{movement.kind === 'deposit' ? 'Deposit to investment' : 'Withdrawal from investment'}</strong><small>{movement.description || 'Investment transfer'}</small></div></div></td><td>{accountLabel(movement.wallet_account_id)}</td><td>{movement.investment_account?.[0]?.name ?? 'Investment account'}</td><td>{new Date(movement.occurred_at).toLocaleDateString()}</td><td class="amount-cell"><strong class:income-value={movement.kind === 'withdrawal'} class:expense-value={movement.kind === 'deposit'}>{movement.kind === 'withdrawal' ? '+' : '−'}{movement.amount}</strong></td></tr>{/each}</tbody></table></div></section>{/if}
      {#if data.creditMovements.length}<section class="section-block"><div class="section-heading"><div><p class="eyebrow">Linked credit activity</p><h2>Borrowing, lending & repayments</h2><p class="section-caption">Latest 25 movements. Principal is excluded from income and spending. Paid interest and fees also appear as expenses below.</p></div><a href="/credit">Manage credit</a></div><div class="ledger-table-wrap"><table class="ledger-table"><thead><tr><th>Date</th><th>Movement</th><th>Wallet</th><th>Destination</th><th>Principal</th><th>Interest / fees</th></tr></thead><tbody>{#each data.creditMovements as movement}<tr><td>{movement.occurred_on}</td><td><a href="/credit">{movement.kind === 'lend' ? 'Money lent' : movement.kind === 'collect' ? 'Lending repayment received' : movement.kind === 'borrow' ? 'Borrowing received' : 'Credit repayment'}</a></td><td>{accountLabel(movement.account_id)}</td><td>{movement.destination_account_id ? accountLabel(movement.destination_account_id) : movement.kind === 'lend' ? 'To borrower' : movement.kind === 'collect' ? 'From borrower' : movement.kind === 'borrow' ? 'From external lender' : 'To external lender'}</td><td>{movement.principal}</td><td>{movement.charges}</td></tr>{/each}</tbody></table></div></section>{/if}
      {#if data.creditError}<p class="form-alert">Credit activity unavailable: {data.creditError}</p>{/if}
      <section class="section-block" id="transaction-history"><div class="section-heading"><div><p class="eyebrow">Your ledger</p><h2>Transaction history</h2></div><span class="section-caption">{data.totalTransactions} {data.totalTransactions === 1 ? 'entry' : 'entries'}{data.walletFilterName ? `  |  ${data.walletFilterName}` : ''}</span></div>
        <form method="GET" action="/transactions#transaction-history" class="history-filter"><label for="history-wallet">Show activity for</label><select id="history-wallet" name="wallet" value={data.walletFilter}><option value="">All wallets</option>{#each data.groups as group}<option value={group.id}>{group.name}{group.kind === 'personal' ? '  |  Personal' : '  |  Project'}</option>{/each}</select><button class="overview-shortcut" type="submit">Filter history</button>{#if data.walletFilter}<a href="/transactions#transaction-history">Clear</a>{/if}</form>
        {#if data.transactions.length}<div class="ledger-table-wrap"><table class="ledger-table"><thead><tr><th>Transaction</th><th>Wallet</th><th>Category / destination</th><th>Date</th><th class="amount-cell">Amount</th></tr></thead><tbody>{#each data.transactions as transaction}<tr><td><div class="ledger-title"><span class="transaction-icon" class:transfer-icon={transaction.kind === 'transfer'}>{#if transaction.kind === 'income'}<ArrowDownLeft size={16}/>{:else if transaction.kind === 'expense'}<ArrowUpRight size={16}/>{:else}<ArrowLeftRight size={16}/>{/if}</span><div><strong>{transaction.description || (transaction.kind === 'income' ? 'Income' : transaction.kind === 'expense' ? 'Spending' : 'Transfer')}</strong><small>{transaction.kind === 'income' ? 'Income' : transaction.kind === 'expense' ? 'Spending' : 'Transfer'}</small></div></div></td><td>{accountLabel(transaction.account_id)}</td><td>{transaction.kind === 'transfer' ? `→ ${accountLabel(transaction.destination_account_id)}` : categoryLabel(transaction.category_id)}{#if transaction.kind === 'transfer' && Number(transaction.fee_amount) > 0}<small class="ledger-subline">Fee: {transaction.fee_amount}</small>{/if}</td><td>{new Date(transaction.occurred_at).toLocaleDateString()}</td><td class="amount-cell"><strong class:income-value={transaction.kind === 'income'} class:expense-value={transaction.kind === 'expense'}>{transaction.kind === 'income' ? '+' : transaction.kind === 'expense' ? '−' : ''}{transaction.amount}</strong></td></tr>{/each}</tbody></table></div>
          {#if data.totalPages > 1}<nav class="pagination" aria-label="Transaction pages"><span>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.totalTransactions)} of {data.totalTransactions}</span><div><a class:disabled-page={data.page <= 1} aria-disabled={data.page <= 1} href={data.page <= 1 ? '#transaction-history' : historyPageHref(data.page - 1)}>Previous</a><span class="page-count">Page {data.page} of {data.totalPages}</span><a class:disabled-page={data.page >= data.totalPages} aria-disabled={data.page >= data.totalPages} href={data.page >= data.totalPages ? '#transaction-history' : historyPageHref(data.page + 1)}>Next</a></div></nav>{/if}
        {:else}<div class="empty-card"><div class="empty-icon"><ArrowLeftRight size={23}/></div><h3>{data.walletFilterName ? `No transactions for ${data.walletFilterName} yet` : 'No transactions yet'}</h3><p>{data.walletFilterName ? 'Try another wallet or clear the filter to see all activity.' : 'Your income, spending, and transfers will appear here.'}</p></div>{/if}
      </section>
    </div>
  </main>
  
</div>

<style>
.shortcut-buttons { display: flex; flex-wrap: wrap; gap: .85rem; }
.shortcut-button { display: flex; align-items: center; gap: .85rem; width: 340px; max-width: 100%; min-height: 112px; padding: 1rem; text-align: left; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 16px; cursor: pointer; box-shadow: 0 3px 0 rgb(0 0 0 / .16); transition: background .15s, border-color .15s, transform .15s, box-shadow .15s; }
.shortcut-button:hover:not(:disabled) { border-color: var(--accent, #42785a); background: var(--accent-soft, #f1f7f3); transform: translateY(-2px); box-shadow: 0 5px 12px rgb(0 0 0 / .16); }
.shortcut-button:active:not(:disabled) { transform: translateY(1px); box-shadow: none; }
.shortcut-button:focus-visible { outline: 3px solid var(--accent, #42785a); outline-offset: 4px; }
.shortcut-button:disabled { opacity: .55; cursor: default; }
.shortcut-icon { flex: 0 0 46px; height: 46px; display: grid; place-items: center; color: var(--accent, #17493b); background: var(--accent-soft, #e9f0e8); border-radius: 12px; }
.shortcut-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .4rem; }
.shortcut-content strong { font-size: .95rem; line-height: 1.35; overflow-wrap: anywhere; }
.shortcut-amount { display: flex; align-items: baseline; flex-wrap: wrap; gap: .5rem; font-size: 1.1rem; font-weight: 750; }
.shortcut-kind { font-size: .65rem; font-weight: 600; color: var(--muted); }
.shortcut-content small { color: var(--muted); font-size: .7rem; line-height: 1.4; overflow-wrap: anywhere; }
.shortcut-action { flex: 0 0 26px; height: 26px; display: grid; place-items: center; border-radius: 50%; color: var(--accent, #17493b); background: var(--accent-soft, #e9f0e8); }
@media (max-width: 480px) { .shortcut-button { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .shortcut-button { transition: none; } }
.shortcut-dialog { width: min(480px, calc(100% - 2rem)); max-height: 90dvh; overflow: auto; padding: 1.5rem; border: 1px solid var(--line); border-radius: 16px; background: var(--surface, #fff); color: var(--ink); }
.shortcut-dialog::backdrop { background: rgb(0 0 0 / .45); }
.shortcut-dialog p { overflow-wrap: anywhere; }
.shortcut-dialog label { display: grid; gap: .5rem; }
.confirm-actions { display: flex; justify-content: flex-end; gap: 1rem; margin-top: 1.5rem; flex-wrap: wrap; }
</style>
