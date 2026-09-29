<script lang="ts">
  import { goto } from '$app/navigation';
  import { ArrowLeftRight, BarChart3, Download, FileText, LayoutDashboard, LogOut, Settings2, WalletCards, TrendingUp, TrendingDown } from 'lucide-svelte';
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import type { Currency } from '$lib/types/finance';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  let movementMode = $state<'both' | 'income' | 'spending'>('both');
  const money = (value: string, currency: Currency) => formatMoney(decimalToMinorUnits(value), currency);
  const movementTotal = (field: 'income' | 'spending', currency: Currency) => data.months.reduce((sum, month) => sum + decimalToMinorUnits(month[currency][field]), 0n);
  const max = (currency: Currency) => Math.max(1, ...data.months.flatMap((month) => [movementMode !== 'spending' ? Number(month[currency].income) : 0, movementMode !== 'income' ? Number(month[currency].spending) : 0]));
  const height = (value: string, currency: Currency) => `${Number(value) === 0 ? 0 : Math.max(3, Number(value) / max(currency) * 100)}%`;
  const halfMax = (currency: Currency) => String(Math.round(max(currency) * 50) / 100);
  async function submitStatement(event: SubmitEvent) {
    event.preventDefault();
    const values = new FormData(event.currentTarget as HTMLFormElement);
    const params = new URLSearchParams();
    for (const name of ['wallet', 'from', 'to', 'activity']) params.set(name, String(values.get(name) ?? ''));
    await goto(`/insights?${params.toString()}`, { noScroll: true, keepFocus: true });
  }
  function csvCell(value: string) { return `"${String(value).replaceAll('"', '""')}"`; }
  function saveFile(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  function downloadStatement() {
    if (!data.statement.walletKey || data.statement.error) return;
    const currency = data.statement.currency;
    const lines = [
      ['Wallet statement', data.statement.accountName], ['Period', `${data.statement.from} to ${data.statement.to}`], ['Opening balance', `${data.statement.opening} ${currency}`], ['Closing balance', `${data.statement.closing} ${currency}`],
      ['Date', 'Description', 'Reference', 'Type', 'Debit', 'Credit', `Balance (${currency})`],
      ...data.statement.rows.map((row) => [row.date.slice(0, 10), row.description, row.reference, row.type, row.debit, row.credit, row.balance])
    ];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
    saveFile(blob, `statement-${data.statement.from}-${data.statement.to}.csv`);
  }
  function currencyLabel(currency: string) { return currency === 'USD' ? 'USD' : 'ZIG'; }
  function downloadStatementPdf() {
    if (!data.statement.walletKey || data.statement.error) return;
    const safe = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
    const escape = (value: string) => safe(value).replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
    const draw = (value: string, x: number, y: number, size = 8, font = 'F1') => `BT /${font} ${size} Tf ${x} ${y} Td (${escape(value)}) Tj ET`;
    const right = (value: string, x: number, y: number, size = 8) => draw(value, x - safe(value).length * size * 0.48, y, size);
    const rowsPerPage = 34;
    const pages = Array.from({ length: Math.max(1, Math.ceil(data.statement.rows.length / rowsPerPage)) }, (_, index) => data.statement.rows.slice(index * rowsPerPage, (index + 1) * rowsPerPage));
    const content: string[] = [];
    for (let page = 0; page < pages.length; page++) {
      const activityLabel = data.statement.activity === 'both' ? 'All activity' : data.statement.activity === 'income' ? 'Income only' : 'Expenses and transfers out';
      const commands = ['0.12 0.30 0.24 rg', draw('BUDGET - WALLET STATEMENT', 42, 790, 18, 'F2'), '0 0 0 rg', draw(data.statement.accountName, 42, 764, 12, 'F2'), draw(`Period: ${data.statement.from} to ${data.statement.to}`, 42, 746, 9), draw(`Activity: ${activityLabel}`, 42, 731, 9)];
      commands.push('0.94 0.96 0.93 rg 36 700 523 30 re f', '0 0 0 rg', draw(`Opening: ${data.statement.opening} ${currencyLabel(data.statement.currency)}`, 48, 711, 9, 'F2'), right(`Closing: ${data.statement.closing} ${currencyLabel(data.statement.currency)}`, 545, 711, 9));
      commands.push('0.12 0.30 0.24 rg', draw('DATE', 42, 676, 7, 'F2'), draw('DESCRIPTION', 105, 676, 7, 'F2'), draw('REFERENCE', 259, 676, 7, 'F2'), draw('TYPE', 323, 676, 7, 'F2'), right('DEBIT', 410, 676, 7), right('CREDIT', 472, 676, 7), right('BALANCE', 552, 676, 7), '0.78 0.82 0.78 RG 36 668 m 559 668 l S', '0 0 0 rg');
      pages[page].forEach((row, index) => {
        const y = 650 - index * 17;
        commands.push(draw(row.date.slice(0, 10), 42, y, 7), draw(safe(row.description).slice(0, 26), 105, y, 7), draw(row.reference.slice(0, 8).toUpperCase(), 259, y, 7), draw(row.type, 323, y, 7), right(row.debit || '-', 410, y, 7), right(row.credit || '-', 472, y, 7), right(`${row.balance} ${currencyLabel(data.statement.currency)}`, 552, y, 7));
      });
      commands.push('0.78 0.82 0.78 RG 36 42 m 559 42 l S', draw(`Budget ledger - Page ${page + 1} of ${pages.length}`, 42, 27, 7));
      content.push(commands.join('\n'));
    }
    const objects: string[] = [];
    objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[2] = `<< /Type /Pages /Kids [${pages.map((_, index) => `${5 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`;
    objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
    objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
    content.forEach((body, index) => {
      const pageId = 5 + index * 2; const contentId = pageId + 1; const stream = `${body}\n`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`;
    });
    let pdf = '%PDF-1.4\n'; const offsets: number[] = [0];
    for (let id = 1; id < objects.length; id++) { offsets[id] = new TextEncoder().encode(pdf).length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; }
    const xref = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const blob = new Blob([new TextEncoder().encode(pdf)], { type: 'application/pdf' });
    saveFile(blob, `statement-${data.statement.from}-${data.statement.to}.pdf`);
  }
</script>
<svelte:head><title>Insights — Budget</title></svelte:head>
<div class="app-frame"><aside class="sidebar"><a class="brand" href="/dashboard"><span class="brand-mark"><WalletCards size={21}/></span><span>Budget</span></a><div class="sidebar-label">Workspace</div><a class="side-link" href="/dashboard"><LayoutDashboard size={18}/> Overview</a><div class="sidebar-label side-label-spaced">Your money</div><a class="side-link" href="/wallets"><WalletCards size={18}/> Wallets</a><a class="side-link" href="/transactions"><ArrowLeftRight size={18}/> Transactions</a><a class="side-link" href="/budgets"><WalletCards size={18}/> Budgets</a><a class="side-link active" href="/insights"><BarChart3 size={18}/> Insights</a><div class="sidebar-bottom"><a class="side-link" href="/settings"><Settings2 size={18}/> Settings</a><form method="POST" action="/logout"><button class="side-link" type="submit"><LogOut size={18}/> Sign out</button></form></div></aside>
<main class="main-area"><header class="topbar"><div><p class="date-label">Patterns at a glance</p><p class="topbar-title">Insights</p></div></header><div class="content-wrap insights-content"><section class="welcome-row"><div><p class="eyebrow">Your trends</p><h1>Understand where it <span class="accent-period">goes.</span></h1><p class="welcome-copy">Compare monthly income and spending while keeping USD and ZiG separate.</p></div><div class="currency-note">Last 6 months</div></section>
{#if data.loadError}<div class="setup-banner"><div><strong>Database setup needed</strong><p>{data.loadError}. Run the setup SQL in Supabase, then refresh.</p></div></div>{/if}
<section class="overview-metrics insight-balance-metrics" aria-label="Current wallet balances"><article class="overview-metric balance-metric"><div class="metric-heading"><span class="metric-icon"><WalletCards size={17}/></span><span>Current USD balance</span></div><p class="metric-caption">Across active wallets, including opening balances</p><strong class="insight-balance-value">{money(data.balances.USD, 'USD')}</strong></article><article class="overview-metric balance-metric"><div class="metric-heading"><span class="metric-icon"><WalletCards size={17}/></span><span>Current ZiG balance</span></div><p class="metric-caption">Across active wallets, including opening balances</p><strong class="insight-balance-value">{money(data.balances.ZIG, 'ZIG')}</strong></article></section>
<section class="overview-metrics insight-flow-metrics" aria-label="Income and spending in the last six months">{#each ['income', 'spending'] as field}<article class="overview-metric"><div class="metric-heading"><span class="metric-icon" class:income-metric-icon={field === 'income'} class:spend-metric-icon={field === 'spending'}>{#if field === 'income'}<TrendingUp size={17}/>{:else}<TrendingDown size={17}/>{/if}</span><span>{field === 'income' ? 'Income received' : 'Spent, including transfer fees'} · 6 months</span></div><p class="metric-caption">Combined by currency, never converted</p><div class="metric-currency-pair"><div><span class="currency-badge">USD</span><strong>{formatMoney(movementTotal(field as 'income' | 'spending', 'USD'), 'USD')}</strong></div><div><span class="currency-badge zig-badge">ZiG</span><strong>{formatMoney(movementTotal(field as 'income' | 'spending', 'ZIG'), 'ZIG')}</strong></div></div></article>{/each}</section>
<section class="section-block"><div class="section-heading movement-heading"><div><p class="eyebrow">Income and spending</p><h2>Monthly movement</h2><p class="section-caption">Compare each currency on its own scale.</p></div><div class="chart-toggle" role="group" aria-label="Monthly chart view"><button type="button" class:active={movementMode === 'both'} aria-pressed={movementMode === 'both'} onclick={() => movementMode = 'both'}>Both</button><button type="button" class:active={movementMode === 'income'} aria-pressed={movementMode === 'income'} onclick={() => movementMode = 'income'}>Income</button><button type="button" class:active={movementMode === 'spending'} aria-pressed={movementMode === 'spending'} onclick={() => movementMode = 'spending'}>Spending</button></div></div>{#if !data.hasMovement}<div class="analytics-empty-note"><strong>No income or spending recorded in these six months yet.</strong><span>Opening balances appear above and aren’t counted as monthly movement. Record a transaction to start building your trends.</span><a href="/transactions">Add a transaction →</a></div>{/if}<div class="movement-charts">{#each ['USD', 'ZIG'] as currency}<article class="movement-chart"><header><span class="currency-badge" class:zig-badge={currency === 'ZIG'}>{currency === 'USD' ? 'USD' : 'ZiG'}</span><strong>{currency === 'USD' ? 'US dollar' : 'Zimbabwe Gold'}</strong></header><div class="bar-chart" role="img" aria-label={`${currency} monthly ${movementMode === 'both' ? 'income and spending' : movementMode}`}><div class="chart-y-labels"><span>{money(String(max(currency as Currency)), currency as Currency)}</span><span>{money(halfMax(currency as Currency), currency as Currency)}</span><span>0</span></div><div class="chart-plot">{#each data.months as month}<div class="chart-month"><div class="chart-bars">{#if movementMode !== 'spending'}<span class="chart-column income-column" style={`height:${height(month[currency as Currency].income, currency as Currency)}`} title={`Income ${money(month[currency as Currency].income, currency as Currency)}`}></span>{/if}{#if movementMode !== 'income'}<span class="chart-column spending-column" style={`height:${height(month[currency as Currency].spending, currency as Currency)}`} title={`Spending ${money(month[currency as Currency].spending, currency as Currency)}`}></span>{/if}</div><span class="chart-month-label">{month.label}</span></div>{/each}</div></div></article>{/each}</div><div class="chart-legend"><span><i class="legend-income"></i>Income</span><span><i class="legend-spend"></i>Spending and transfer fees</span></div></section>
<section id="wallet-statement" class="section-block statement-section"><div class="section-heading"><div><p class="eyebrow">Your ledger</p><h2>Wallet statement</h2><p class="section-caption">Download a bank-style statement for a wallet and date range.</p></div></div>
<form method="GET" action="/insights" class="history-filter statement-filters" onsubmit={submitStatement}><label>Wallet<select name="wallet" value={data.statement.walletKey}><option value="">Choose a wallet and currency</option>{#each data.statementWallets as wallet}<option value={wallet.key}>{wallet.label}</option>{/each}</select></label><label>From<input type="date" name="from" value={data.statement.from}/></label><label>To<input type="date" name="to" value={data.statement.to}/></label><label>Activity<select name="activity" value={data.statement.activity}><option value="both">All activity</option><option value="income">Income only</option><option value="expense">Expenses and transfers out</option></select></label><button class="primary-button statement-apply" type="submit">Show statement</button></form>
{#if data.statement.error}<div class="analytics-empty-note" role="alert">{data.statement.error}</div>{:else if !data.statement.walletKey}<div class="empty-card compact-empty"><FileText size={24}/><h3>Choose a wallet</h3><p>Select a main wallet and currency to prepare its statement.</p></div>{:else}<div class="statement-paper"><div class="statement-title-row"><div><span class="eyebrow">Account activity</span><h3>{data.statement.accountName}</h3><p>{data.statement.from} to {data.statement.to}</p></div><div class="statement-actions"><button class="secondary-button" type="button" onclick={downloadStatement}><Download size={15}/> Download CSV</button><button class="secondary-button" type="button" onclick={downloadStatementPdf}><Download size={15}/> Download PDF</button></div></div><div class="statement-summary"><div><span>Opening balance</span><strong>{money(data.statement.opening, data.statement.currency as Currency)}</strong></div><div><span>Closing balance</span><strong>{money(data.statement.closing, data.statement.currency as Currency)}</strong></div><p>Balances include all ledger activity. The selected filter only changes which entries are listed.</p></div>{#if data.statement.rows.length}<div class="statement-table-wrap"><table class="statement-table"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th>Type</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{#each data.statement.rows as row}<tr><td>{new Date(`${row.date.slice(0, 10)}T12:00:00`).toLocaleDateString()}</td><td>{row.description}</td><td class="statement-reference">{row.reference.slice(0, 8).toUpperCase()}</td><td>{row.type}</td><td>{row.debit ? money(row.debit, data.statement.currency as Currency) : '—'}</td><td>{row.credit ? money(row.credit, data.statement.currency as Currency) : '—'}</td><td><strong>{money(row.balance, data.statement.currency as Currency)}</strong></td></tr>{/each}</tbody></table></div>{:else}<div class="statement-no-rows">No entries match this wallet, period, and activity filter.</div>{/if}</div>{/if}</section>
<div class="insight-columns"><section class="section-block"><div class="section-heading"><div><p class="eyebrow">Current month</p><h2>Top categories</h2></div></div>{#if data.topCategories.length}<div class="settings-list">{#each data.topCategories as category}<div class="settings-row"><div><strong>{category.name}</strong><span>{category.currency} · Spending</span></div><strong>{money(category.amount, category.currency as Currency)}</strong></div>{/each}</div>{:else}<div class="empty-card compact-empty"><h3>No spending patterns yet</h3><p>Add transactions to see your top categories.</p></div>{/if}</section>
<section class="section-block"><div class="section-heading"><div><p class="eyebrow">By wallet</p><h2>Income and outflow</h2></div></div>{#if data.wallets.length}<div class="settings-list">{#each data.wallets as wallet}<div class="settings-row wallet-insight-row"><div><strong>{wallet.group}</strong><span>{wallet.currency} · In {money(wallet.income, wallet.currency as Currency)}</span></div><span class="wallet-outflow">Out {money(wallet.spending, wallet.currency as Currency)}</span></div>{/each}</div>{:else}<div class="empty-card compact-empty"><h3>No wallet activity yet</h3><p>Wallet summaries appear after transactions are added.</p></div>{/if}</section></div>
<footer class="dashboard-footer"><span>Currency amounts are never combined.</span><span>Monthly view starts {new Date(`${data.periodStart}T00:00:00`).toLocaleDateString('en', { month: 'long', year: 'numeric' })}.</span></footer></div></main>
<nav class="mobile-nav" aria-label="Main navigation"><a href="/dashboard"><LayoutDashboard size={18}/><span>Overview</span></a><a href="/wallets"><WalletCards size={18}/><span>Wallets</span></a><a href="/transactions"><ArrowLeftRight size={18}/><span>Activity</span></a><a href="/budgets"><WalletCards size={18}/><span>Budgets</span></a><a class="mobile-nav-active" href="/insights"><BarChart3 size={18}/><span>Insights</span></a><a href="/settings"><Settings2 size={18}/><span>Settings</span></a></nav></div>
