<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  import { WalletCards, LayoutDashboard, ArrowLeftRight, Settings2, LogOut, Plus, CreditCard, CalendarDays, ArrowUpRight, ChevronDown, ShieldCheck } from 'lucide-svelte';
  import { creditMinor } from '$lib/credit';
  import { formatMoney } from '$lib/finance';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  let kind = $state('external');
  let receiving = $state('');
  let selected = $state('');
  let submitting = $state(false);
  let feedbackShown = $state(false);
  let borrowingOpen = $state(false);
  function openBorrowing() {
    borrowingOpen = true;
    requestAnimationFrame(() => document.getElementById('new-borrowing')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  const money = (value: string | number, currency: 'USD' | 'ZIG') => formatMoney(creditMinor(value), currency);
  const activeAccounts = $derived(data.accounts.filter((a) => a.active));
  const receivingCurrency = $derived(data.accounts.find((a) => a.id === receiving)?.currency);
  const credits = $derived(selected ? data.credits.filter((c) => c.id === selected) : data.credits);
  const submit: SubmitFunction = async (input) => {
    submitting = true;
    feedbackShown = true;
    const finish = await handleInvestmentSubmit(input);
    return async (result) => {
      try {
        if (typeof finish === 'function') await finish(result);
      } finally {
        submitting = false;
      }
    };
  };
</script>

<svelte:head><title>Credit — Budget</title></svelte:head>
<div class="app-frame">
  <aside class="sidebar">
    <a class="brand" href="/dashboard"><span class="brand-mark"><WalletCards size={21}/></span><span>Budget</span></a>
    <div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a>
    <div class="sidebar-label side-label-spaced">Your money</div>
    <a class="side-link" href="/wallets"><WalletCards size={18}/> Wallets</a><a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a>
    <a class="side-link" href="/investments"><WalletCards size={18}/> Investments</a><a class="side-link active" href="/credit"><WalletCards size={18}/> Credit</a>
    <a class="side-link" href="/budgets"><WalletCards size={18}/> Budgets</a><a class="side-link" href="/insights"><WalletCards size={18}/> Insights</a>
    <div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div>
  </aside>
  <main class="main-area">
    <header class="topbar"><div><p class="date-label">Borrow with a plan</p><p class="topbar-title">Credit</p></div></header>
    <div class="content-wrap credit-content">
      <section class="welcome-row credit-intro"><div><p class="eyebrow">Borrowing & repayments</p><h1>Credit<span class="accent-period">.</span></h1><p class="welcome-copy">A clear view of what you owe, when it’s due, and how far you’ve come.</p></div><button class="primary-button credit-new-button" onclick={openBorrowing}><Plus size={17}/> New borrowing</button></section>
      {#if data.loadError}<div class="setup-banner" role="alert"><div><strong>Credit is not ready</strong><p>{data.loadError}</p><p>Apply supabase/migrations/0006_credit.sql in Supabase, then refresh.</p></div></div>{/if}
      {#if form?.message && !feedbackShown}<p class="form-alert" class:credit-success={form.success} role="status">{form.message}</p>{/if}
      <div class="credit-summary">
        {#each ['USD', 'ZIG'] as currency}
          {@const loans = data.credits.filter((c) => c.currency === currency)}
          {@const overdue = loans.reduce((sum, c) => sum + creditMinor(c.overdue), 0n)}
          <article class="credit-summary-card" class:credit-zig={currency === 'ZIG'}><div class="credit-summary-top"><span class="credit-currency"><span class="credit-currency-dot"></span>{currency === 'ZIG' ? 'ZiG' : currency} overview</span><span class="credit-summary-icon"><CreditCard size={19}/></span></div><p class="credit-total">{formatMoney(loans.filter((c) => c.kind === 'external').reduce((sum, c) => sum + creditMinor(c.outstanding), 0n), currency as 'USD' | 'ZIG')}</p><p class="credit-total-label">External debt outstanding</p><dl><div><dt><ArrowLeftRight size={14}/> Internal reimbursements</dt><dd>{formatMoney(loans.filter((c) => c.kind === 'internal').reduce((sum, c) => sum + creditMinor(c.outstanding), 0n), currency as 'USD' | 'ZIG')}</dd></div><div class:credit-amount-overdue={overdue > 0n}><dt><CalendarDays size={14}/> Overdue</dt><dd>{formatMoney(overdue, currency as 'USD' | 'ZIG')}</dd></div></dl></article>
        {/each}
      </div>
      <div class="credit-note"><ShieldCheck size={17}/><p>Borrowed money stays separate from income. Your wallets update when you record borrowing or a repayment.</p></div>
      <section class="section-block credit-create" id="new-borrowing">
        <details bind:open={borrowingOpen}><summary><span class="credit-create-icon"><Plus size={18}/></span><span><strong>Record new borrowing</strong><small>An external loan or a temporary transfer between your wallets</small></span><ChevronDown size={18} class="credit-chevron"/></summary><p class="section-caption">This records money received now. Principal is excluded from income and spending. Internal borrowing uses wallets in the same currency.</p>
          <form method="POST" action="?/create" class="feature-form credit-form" use:enhance={submit}>
            <label>Name<input name="name" maxlength="100" required placeholder="Laptop loan or Personal from Project A"/></label>
            <label>Borrowing type<select name="kind" bind:value={kind}><option value="external">External loan</option><option value="internal">Between my wallets</option></select></label>
            <label>Receiving wallet<select name="receiving_account_id" bind:value={receiving} required><option value="">Choose wallet</option>{#each activeAccounts as a}<option value={a.id}>{a.label}</option>{/each}</select></label>
            {#if kind === 'internal'}<label>Lending wallet<select name="lending_account_id" required><option value="">Choose wallet</option>{#each activeAccounts.filter((a) => a.id !== receiving && a.currency === receivingCurrency) as a}<option value={a.id}>{a.label}</option>{/each}</select></label>{:else}<label>Lender<input name="lender" maxlength="100" required placeholder="Bank, company or person"/></label>{/if}
            <label>Amount borrowed<input name="principal" type="number" min="0.01" step="0.01" required/></label>
            {#if kind === 'external'}<label>Total agreed interest & fees<input name="charges" type="number" min="0" step="0.01" value="0" required/><small>Fixed total, entered manually; no automatic interest calculation.</small></label>{:else}<input name="charges" type="hidden" value="0"/>{/if}
            <label>Borrowed on<input name="borrowed_on" type="date" value={data.today} max={data.today} required/></label><label>Final repayment due<input name="due_on" type="date" required/></label>
            <label class="form-wide">Notes<textarea name="notes" maxlength="1000" rows="2"></textarea></label>
            <div class="form-wide form-footer"><p>Add any instalment amounts and dates after saving.</p><button class="primary-button" disabled={submitting || !!data.loadError}>Record borrowing</button></div>
          </form>
        </details>
      </section>
      <div class="section-heading credit-list-heading"><div><p class="eyebrow">Your commitments</p><h2>Loans & wallet borrowing <span class="credit-count">{data.credits.length}</span></h2></div><label class="credit-filter"><span>Show</span><select bind:value={selected}><option value="">All credit</option>{#each data.credits as c}<option value={c.id}>{c.name}</option>{/each}</select></label></div>
      {#each credits as c}
          {@const totalOwed = creditMinor(c.principal) + creditMinor(c.charges)}
          {@const repaymentPercent = totalOwed > 0n ? Number(creditMinor(c.paid) * 100n / totalOwed) : 0}

        <section class="section-block credit-card">
          <div class="section-heading"><div><p class="eyebrow">{c.kind === 'internal' ? 'Internal wallet borrowing' : `External loan · ${c.lender}`}</p><h2>{c.name}</h2><p class="section-caption">Received in {data.accounts.find((a) => a.id === c.receiving_account_id)?.label}{c.kind === 'internal' ? ` from ${data.accounts.find((a) => a.id === c.lending_account_id)?.label}` : ''}</p></div><span class="currency-badge" class:credit-overdue={c.status === 'Overdue'}>{c.status}</span></div>
          <div class="credit-stats"><div><small>Outstanding</small><strong>{money(c.outstanding, c.currency)}</strong></div><div><small>Repaid</small><strong>{money(c.paid, c.currency)}</strong></div><div><small>Next due</small><strong>{c.nextDue ?? 'Complete'}</strong></div><div><small>Final repayment</small><strong>{c.due_on}</strong></div></div>
          <div class="credit-progress-caption"><span>Repayment progress</span><strong>{repaymentPercent}% repaid</strong></div><div class="credit-progress" role="progressbar" aria-label={`${c.name} repayment progress`} aria-valuenow={repaymentPercent} aria-valuemin="0" aria-valuemax="100"><span style:width={`${repaymentPercent}%`}></span></div>
          <p class="section-caption">Borrowed {money(c.principal, c.currency)} on {c.borrowed_on}{creditMinor(c.charges) > 0n ? ` + ${money(c.charges, c.currency)} agreed interest / fees` : ''}. {c.notes}</p>
          <h3>Repayment plan</h3><p class="section-caption">Payments cover the earliest instalments first. Unscheduled balance remaining: {money(c.unscheduledOutstanding, c.currency)} — due by {c.due_on}. Plans do not move money.</p>
          {#if c.schedule.length}<div class="ledger-table-wrap"><table class="ledger-table"><thead><tr><th>Due date</th><th>Planned</th><th>Paid</th><th>Remaining</th><th>Status</th><th></th></tr></thead><tbody>{#each c.schedule as i}<tr><td>{i.due_on}</td><td>{money(i.amount, c.currency)}</td><td>{money(i.paid, c.currency)}</td><td>{money(i.remaining, c.currency)}</td><td>{i.status}</td><td><form method="POST" action="?/removeInstalment" use:enhance={submit}><input type="hidden" name="credit_id" value={c.id}/><input type="hidden" name="instalment_id" value={i.id}/><button class="secondary-button" disabled={submitting} aria-label={`Remove instalment due ${i.due_on}`}>Remove</button></form></td></tr>{/each}</tbody></table></div>{/if}
          <div class="credit-actions">
            <details><summary>Add an instalment</summary><form method="POST" action="?/instalment" class="feature-form credit-form" use:enhance={submit}><input type="hidden" name="credit_id" value={c.id}/><label>Due date<input name="due_on" type="date" min={c.borrowed_on} max={c.due_on} required/></label><label>Amount ({c.currency})<input name="amount" type="number" min="0.01" step="0.01" max={c.unplanned} required/></label><button class="primary-button" disabled={submitting || creditMinor(c.unplanned) === 0n}>Add instalment</button></form></details>
            <details><summary>Change final repayment date</summary><form method="POST" action="?/dueDate" class="feature-form credit-form" use:enhance={submit}><input type="hidden" name="credit_id" value={c.id}/><label>Final due date<input name="due_on" type="date" min={c.borrowed_on} value={c.due_on} required/></label><button class="secondary-button" disabled={submitting}>Save date</button></form></details>
            {#if c.status !== 'Repaid'}<details><summary>Record a repayment</summary><p class="section-caption">Partial and early payments are welcome. Actual payments update wallets immediately.</p><form method="POST" action="?/repay" class="feature-form credit-form" use:enhance={submit}>
              <input type="hidden" name="credit_id" value={c.id}/><label>Pay from<select name="account_id" required><option value="">Choose wallet</option>{#each activeAccounts.filter((a) => a.currency === c.currency && a.id !== c.lending_account_id) as a}<option value={a.id}>{a.label}</option>{/each}</select></label><label>Payment date<input name="occurred_on" type="date" min={c.borrowed_on} max={data.today} value={data.today} required/></label>
              <label>Principal repaid<input name="principal" type="number" min="0" max={c.remainingPrincipal} step="0.01" value="0" required/></label>
              {#if creditMinor(c.remainingCharges) > 0n}<label>Interest / fees paid<input name="charges" type="number" min="0" max={c.remainingCharges} step="0.01" value="0" required/></label><label>Expense category (when paying charges)<select name="category_id"><option value="">Choose category</option>{#each data.categories as category}<option value={category.id}>{category.name}</option>{/each}</select></label>{:else}<input type="hidden" name="charges" value="0"/>{/if}
              <div class="form-wide form-footer"><p>{c.kind === 'internal' ? 'Principal returns to the original lending wallet.' : 'Principal reduces debt. Interest and fees are spending.'}</p><button class="primary-button" disabled={submitting}>Save repayment</button></div>
            </form></details>{/if}
          </div>
          {#if c.payments.length}<h3>Payment history</h3><div class="ledger-table-wrap"><table class="ledger-table"><thead><tr><th>Date</th><th>Paying wallet</th><th>Principal</th><th>Interest / fees</th></tr></thead><tbody>{#each c.payments as p}<tr><td>{p.occurred_on}</td><td>{data.accounts.find((a) => a.id === p.account_id)?.label}</td><td>{money(p.principal, c.currency)}</td><td>{money(p.charges, c.currency)}</td></tr>{/each}</tbody></table></div>{/if}
        </section>
      {:else}<section class="credit-empty"><span class="credit-empty-icon"><CreditCard size={29}/></span><p class="eyebrow">A fresh start</p><h2>No borrowing recorded</h2><p>Keep your loans and wallet borrowing in one place.<br/>Add your first record, then plan repayments at your own pace.</p><button class="primary-button credit-new-button" onclick={openBorrowing}><Plus size={16}/> Add your first borrowing <ArrowUpRight size={15}/></button><span class="credit-empty-footnote"><CalendarDays size={14}/> Flexible instalments. Clear due dates.</span></section>{/each}
    </div>
  </main>
  <nav class="mobile-nav" aria-label="Main navigation"><a href="/dashboard"><LayoutDashboard size={18}/><span>Overview</span></a><a href="/wallets"><WalletCards size={18}/><span>Wallets</span></a><a href="/transactions"><ArrowLeftRight size={18}/><span>Activity</span></a><a class="mobile-nav-active" href="/credit"><WalletCards size={18}/><span>Credit</span></a><a href="/budgets"><WalletCards size={18}/><span>Budgets</span></a><a href="/settings"><Settings2 size={18}/><span>Settings</span></a></nav>
</div>

<style>
  .credit-content { max-width: 1250px; padding-bottom: 56px; }
  .credit-intro { align-items: center; gap: 24px; }
  .credit-intro .welcome-copy { max-width: 580px; line-height: 1.7; }
  .credit-new-button { flex-shrink: 0; padding: 0 20px; box-shadow: 0 4px 10px #17493b12; }
  .credit-summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 28px; }
  .credit-summary-card { position: relative; padding: 24px 26px 8px; overflow: hidden; border: 1px solid #dfe8df; border-radius: 18px; background: linear-gradient(125deg, #fff 45%, #f0f6ed); box-shadow: 0 3px 12px #20342d04; }
  .credit-zig { border-color: #e3e4ed; background: linear-gradient(125deg, #fff 45%, #f2f3f9); }
  .credit-summary-top { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .credit-currency { display: inline-flex; align-items: center; gap: 8px; color: #53685a; font-size: 11px; font-weight: 700; letter-spacing: .5px; }
  .credit-currency-dot { width: 7px; height: 7px; border-radius: 50%; background: #80a862; }
  .credit-zig .credit-currency-dot { background: #8588b3; }
  .credit-summary-icon { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid #e1eadb; border-radius: 12px; background: #eaf2e6; color: #527846; }
  .credit-zig .credit-summary-icon { border-color: #e2e4ef; background: #eceef6; color: #737aa0; }
  .credit-total { margin: 18px 0 5px; color: var(--ink); font-size: clamp(28px, 2.6vw, 38px); font-weight: 750; letter-spacing: -1.5px; font-variant-numeric: tabular-nums; line-height: 1.2; }
  .credit-total-label { margin: 0 0 24px; color: var(--muted); font-size: 12px; }
  .credit-summary dl { display: grid; gap: 0; margin: 0; border-top: 1px solid #e4eade; }
  .credit-zig dl { border-color: #e4e5ee; }
  .credit-summary dl div { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 0; font-size: 11px; }
  .credit-summary dl div + div { border-top: 1px solid #e5e9e480; }
  .credit-summary dt { display: flex; align-items: center; gap: 8px; color: #768279; }
  .credit-summary dd { margin: 0; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .credit-summary .credit-amount-overdue dt, .credit-summary .credit-amount-overdue dd { color: #ae513c; }
  .credit-note { display: flex; align-items: flex-start; gap: 9px; margin: 17px 2px 28px; color: #7c8a7f; }
  .credit-note :global(svg) { flex-shrink: 0; margin-top: 1px; }
  .credit-note p { margin: 0; font-size: 11px; line-height: 1.7; }
  .credit-create { margin-top: 0; margin-bottom: 34px; border: 1px solid var(--line); border-radius: 15px; background: #fff; scroll-margin-top: 24px; }
  summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 650; }
  summary::-webkit-details-marker { display: none; }
  summary:focus-visible { outline: 3px solid #8da96f; outline-offset: 4px; border-radius: 8px; }
  .credit-create summary { display: flex; align-items: center; gap: 13px; padding: 19px 22px; }
  .credit-create summary:hover { background: #f9fbf7; border-radius: 15px; }
  .credit-create summary strong { display: block; color: var(--ink); font-size: 13px; }
  .credit-create summary small { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; font-weight: 400; line-height: 1.5; }
  .credit-create-icon { display: grid; flex-shrink: 0; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: #edf3e9; color: #54724c; }
  .credit-create :global(.credit-chevron) { margin-left: auto; flex-shrink: 0; color: #8d9a90; transition: transform .18s; }
  .credit-create details[open] :global(.credit-chevron) { transform: rotate(180deg); }
  .credit-create details > .section-caption { margin: 0 22px; padding-top: 17px; border-top: 1px solid var(--line); line-height: 1.7; }
  .credit-create .credit-form { margin: 18px 0 0; border: 0; border-radius: 0 0 15px 15px; padding-top: 0; }
  .credit-form { margin-top: 18px; }
  .credit-form label small { font-weight: 400; font-size: 10px; color: var(--muted); line-height: 1.6; }
  .credit-form textarea { width: 100%; min-width: 0; resize: vertical; padding: 12px; border: 1px solid var(--line); border-radius: 9px; background: #fbfcfa; color: var(--ink); font: inherit; font-size: 13px; }
  .credit-form input:focus-visible, .credit-form select:focus-visible, .credit-form textarea:focus-visible, .credit-filter select:focus-visible { outline: 3px solid #8da96f55; outline-offset: 2px; border-color: #8da96f; }
  .credit-form button { align-self: end; padding-inline: 17px; }
  .credit-form .form-footer { border-top: 1px solid var(--line); padding-top: 18px; margin-top: 4px; }
  .credit-list-heading { align-items: center; gap: 16px; margin: 0 0 18px; }
  .credit-list-heading h2 { display: flex; align-items: center; gap: 10px; }
  .credit-count { display: inline-grid; place-items: center; min-width: 23px; height: 23px; padding: 0 7px; border-radius: 7px; background: #e8eee5; color: #70816b; font: 700 10px system-ui; }
  .credit-filter { display: flex; align-items: center; gap: 10px; color: var(--muted); font-size: 11px; }
  .credit-filter select { min-height: 39px; max-width: 220px; padding: 0 32px 0 13px; border: 1px solid var(--line); border-radius: 9px; background: #fff; color: var(--ink); font-family: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
  .credit-card { padding: 25px; margin-top: 18px; border: 1px solid var(--line); border-radius: 17px; background: #fff; box-shadow: 0 3px 12px #20342d03; }
  .credit-card .section-heading { align-items: flex-start; gap: 16px; }
  .credit-card .section-caption { font-size: 11px; line-height: 1.8; }
  .credit-card h3 { margin: 26px 0 8px; font-size: 13px; }
  .credit-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 22px 0 18px; padding: 19px; border: 1px solid #eaf0e5; border-radius: 12px; background: #f7f9f4; }
  .credit-stats small, .credit-stats strong { display: block; }
  .credit-stats small { margin-bottom: 8px; color: var(--muted); font-size: 10px; }
  .credit-stats strong { font-size: 15px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .credit-progress-caption { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 10px; color: var(--muted); }
  .credit-progress-caption strong { font-weight: 600; color: #648052; }
  .credit-progress { height: 5px; margin-bottom: 18px; overflow: hidden; border-radius: 5px; background: #edf1e8; }
  .credit-progress span { display: block; height: 100%; border-radius: inherit; background: #94b275; }
  .credit-actions { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 10px; margin-top: 20px; }
  .credit-actions details { min-width: 0; max-width: 100%; }
  .credit-actions summary { display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 38px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 9px; color: var(--green); background: white; font-size: 11px; font-weight: 700; }
  .credit-actions summary:hover { background: #f5f8f3; }
  .credit-actions summary::after { content: '+'; font-size: 16px; font-weight: 400; color: #8b9b83; }
  .credit-actions details[open] summary::after { content: '\2212'; }
  .credit-actions details[open] { flex-basis: 100%; padding: 15px; border: 1px solid var(--line); border-radius: 12px; background: #fcfdfb; }
  .credit-actions details[open] summary { background: #edf3e9; border-color: #dce7d3; }
  .credit-overdue { color: #a1342d; background: #fff0ed; }
  .credit-success { border-color: #d4e4cd; background: #edf7ee; color: #265c39; }
  .credit-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 44px 24px 32px; border: 1px dashed #d7e0d1; border-radius: 17px; background: radial-gradient(ellipse at top, #f1f6eb 0%, #ffffff 65%); }
  .credit-empty-icon { display: grid; place-items: center; width: 66px; height: 66px; margin-bottom: 22px; border: 1px solid #dce7d3; border-radius: 21px; background: #eaf2e2; color: #6e8c58; box-shadow: 0 0 0 8px #f4f8ef; transform: rotate(-6deg); }
  .credit-empty .eyebrow { margin-bottom: 8px; font-size: 9px; }
  .credit-empty h2 { margin: 0; font-size: 21px; letter-spacing: -.5px; }
  .credit-empty > p:not(.eyebrow) { margin: 12px 0 23px; color: var(--muted); font-size: 12px; line-height: 1.9; }
  .credit-empty-footnote { display: inline-flex; align-items: center; gap: 7px; margin-top: 21px; color: #98a18f; font-size: 10px; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 900px) { .credit-intro { align-items: flex-start; flex-wrap: wrap; } .credit-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 600px) {
    .credit-summary { grid-template-columns: 1fr; gap: 13px; margin-top: 22px; }
    .credit-summary-card { padding: 20px 20px 6px; }
    .credit-total { font-size: 32px; }
    .credit-list-heading { align-items: flex-start; flex-direction: column; }
    .credit-list-heading h2 { font-size: 17px; }
    .credit-filter { width: 100%; }
    .credit-filter select { flex: 1; max-width: none; }
    .credit-create summary { padding: 16px; }
    .credit-create details > .section-caption { margin-inline: 16px; }
    .credit-card { padding: 18px 14px; }
    .credit-card .section-heading h2 { font-size: 17px; overflow-wrap: anywhere; }
    .credit-stats { padding: 15px; gap: 20px 12px; }
    .credit-stats strong { font-size: 14px; }
    .credit-empty { padding: 35px 17px 28px; }
    .credit-empty .credit-new-button { width: 100%; }
    .credit-new-button { min-height: 44px; font-size: 12px; }
    .credit-form .form-footer { align-items: stretch; flex-direction: column; }
  }
  @media (prefers-reduced-motion: reduce) { .credit-create :global(.credit-chevron) { transition: none; } }
</style>
