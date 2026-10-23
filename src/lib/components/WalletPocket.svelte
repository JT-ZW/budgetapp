<script lang="ts">
  import { WalletCards, ArrowUpRight, ChevronDown, Layers3 } from 'lucide-svelte';
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import type { Currency } from '$lib/types/finance';

  type Account = { id: string; currency: string; channel?: string | null; opening_balance: string | number; archived_at?: string | null };
  let { group, balances, visible = false, index = 0 }: {
    group: { id: string; name: string; kind: string; wallet_accounts: Account[] };
    balances: Record<string, string | number>; visible?: boolean; index?: number;
  } = $props();
  let selected = $state<Currency>('USD');
  const currencies = $derived((['USD', 'ZIG'] as Currency[]).filter((currency) => group.wallet_accounts.some((a) => a.currency === currency && !a.archived_at)));
  const currency = $derived(currencies.includes(selected) ? selected : currencies[0] ?? 'USD');
  const accounts = $derived(group.wallet_accounts.filter((a) => a.currency === currency && !a.archived_at).toSorted((a, b) => (a.channel ?? '').localeCompare(b.channel ?? '')));
  const accountCount = $derived(group.wallet_accounts.filter((a) => !a.archived_at).length);
  const total = $derived(accounts.reduce((sum, account) => sum + decimalToMinorUnits(String(balances[account.id] ?? account.opening_balance)), 0n));
  const label = (account: Account) => ({ bank: 'Bank account', cash: 'Cash', ecocash: 'EcoCash' }[account.channel ?? ''] ?? 'Project account');
  const amount = (account: Account) => visible ? formatMoney(decimalToMinorUnits(String(balances[account.id] ?? account.opening_balance)), currency) : '••••••';
</script>

<article class="wallet-pocket" data-tone={index % 4}>
  <header class="pocket-heading">
    <span class="pocket-kind"><span><WalletCards size={16}/></span>{group.kind === 'personal' ? 'Personal wallet' : 'Project wallet'}</span>
    <a href="/settings" class="pocket-manage" aria-label={`Manage ${group.name}`}><ArrowUpRight size={18}/></a>
  </header>
  <div class="pocket-title-row"><h3>{group.name}</h3><span class="pocket-account-count"><Layers3 size={12}/>{accountCount} {accountCount === 1 ? 'account' : 'accounts'}</span></div>
  <div class="pocket-toolbar">
    <div class="pocket-currencies" role="group" aria-label={`${group.name} currency`}>
      {#each currencies as option}<button type="button" class:chosen={currency === option} aria-pressed={currency === option} onclick={() => selected = option}>{option === 'ZIG' ? 'ZiG' : option}</button>{/each}
    </div>
    <span>{currency === 'USD' ? 'US dollar' : 'Zimbabwe Gold'}</span>
  </div>
  <details class="pocket-details">
    <summary aria-label={`View ${group.name} ${currency} accounts`}>
      <div class="pocket-illustration" style={`--note-count:${Math.max(1, Math.min(accounts.length, 3))}`}>
        <div class="pocket-back"></div>
        <div class="pocket-notes">
          {#each accounts.slice(0, 3) as account}
            <div class="pocket-note"><span>{label(account)}</span><strong>{amount(account)}</strong></div>
          {/each}
          {#if !accounts.length}<div class="pocket-note"><span>No active accounts</span></div>{/if}
        </div>
        <div class="pocket-front">
          <div class="pocket-stitch"></div>
          <div class="pocket-front-top"><span class="pocket-wordmark">Homwe<span>.</span></span><img src="/favicon.png" alt="" width="28" height="28" class="pocket-homwe-mark"/></div>
          <div class="pocket-balance"><span>Available balance · {currency === 'ZIG' ? 'ZiG' : currency}</span><strong>{visible ? formatMoney(total, currency) : '••••••'}</strong></div>
          <div class="pocket-open-hint"><span>View {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}</span><ChevronDown size={15}/></div>
        </div>
      </div>
    </summary>
    <div class="pocket-account-list">
      {#each accounts as account}<div><span><i></i>{label(account)}</span><strong>{amount(account)}</strong></div>{/each}
      <a href={`/transactions?wallet=${encodeURIComponent(group.id)}#transaction-history`}>View activity <ArrowUpRight size={14}/></a>
    </div>
  </details>
</article>

<style>
  .pocket-homwe-mark { border-radius: 7px; object-fit: contain; }
  .wallet-pocket { --pocket-dark: #14202d; --pocket-light: #293c4e; --pocket-accent: #a4c6e6; min-width: 0; padding: 23px 25px 26px; border: 1px solid var(--line); border-radius: 26px; background: var(--surface); box-shadow: 0 8px 30px #37254404; font-family: var(--font-sans); }
  .wallet-pocket[data-tone='1'] { --pocket-dark: #17302b; --pocket-light: #2b4c40; --pocket-accent: #a4d8bd; background: var(--surface); border-color: var(--line); }
  .wallet-pocket[data-tone='2'] { --pocket-dark: #30271f; --pocket-light: #554535; --pocket-accent: #e0c39c; background: var(--surface); border-color: var(--line); }
  .wallet-pocket[data-tone='3'] { --pocket-dark: #1b2a3b; --pocket-light: #334c69; --pocket-accent: #aac8eb; background: var(--surface); border-color: var(--line); }
  .pocket-heading { display: flex; justify-content: space-between; align-items: center; }
  .pocket-kind { display: flex; align-items: center; gap: 9px; color: var(--muted); font-size: 10px; font-weight: 550; }
  .pocket-kind > span { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px; color: var(--accent); background: var(--surface-raised); }
  .pocket-manage { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--line); border-radius: 50%; color: var(--muted); background: var(--surface-raised); transition: color .2s, transform .2s; }
  .pocket-manage:hover { color: var(--accent); transform: translate(1px,-1px); }
  .pocket-title-row { display: flex; align-items: baseline; flex-wrap: wrap; gap: 7px 12px; margin: 15px 0 18px; }
  h3 { flex: 1; margin: 0; color: var(--ink); font-size: 20px; font-weight: 650; letter-spacing: -.6px; overflow-wrap: anywhere; }
  .pocket-account-count { display: flex; align-items: center; gap: 5px; color: var(--muted); font-size: 9px; white-space: nowrap; }
  .pocket-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 21px; }
  .pocket-toolbar > span { color: var(--muted); font-size: 9px; }
  .pocket-currencies { display: flex; gap: 3px; padding: 3px; border: 1px solid var(--line); border-radius: 99px; background: #fff; }
  .pocket-currencies button { min-height: 28px; min-width: 42px; padding: 0 10px; border: 0; border-radius: 99px; color: var(--muted); background: transparent; font-size: 9px; font-weight: 600; cursor: pointer; }
  .pocket-currencies button.chosen { color: #fff; background: var(--pocket-dark); }
  .pocket-details summary { display: block; border-radius: 19px 19px 29px 29px; list-style: none; cursor: pointer; }
  .pocket-details summary::-webkit-details-marker { display: none; }
  .pocket-details summary:focus-visible { outline: 3px solid var(--accent); outline-offset: 6px; }
  .pocket-illustration { position: relative; isolation: isolate; width: min(100%,360px); height: calc(155px + var(--note-count) * 41px); margin: 0 auto; }
  .pocket-back { position: absolute; z-index: -1; inset: 32px 0 0; border-radius: 17px 17px 30px 30px; background: var(--pocket-dark); }
  .pocket-notes { position: absolute; inset: auto 13px 113px; }
  .pocket-note { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 9px; min-height: 83px; margin-top: -42px; padding: 14px 15px; border: 1px solid #7693b444; border-radius: 13px 13px 9px 9px; color: #d3e2f1; background: #36495e; box-shadow: 0 -3px 10px #1e15200a; transform: rotate(-2deg); transition: transform .25s ease; }
  .pocket-note:first-child { margin-top: 0; }
  .pocket-note:nth-child(2) { color: #c2e8d6; background: #34584c; transform: rotate(1.5deg); border-color: #507564; }
  .pocket-note:nth-child(3) { color: #f1d6ac; background: #63523d; transform: rotate(-1deg); border-color: #8b7354; }
  .pocket-note span { font-size: 10px; font-weight: 650; }
  .pocket-note strong { min-width: 0; font-size: 11px; font-weight: 550; text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .pocket-front { position: absolute; z-index: 2; inset: auto 0 0; min-height: 166px; display: flex; flex-direction: column; padding: 23px 24px 18px; overflow: hidden; border: 1px solid #ffffff13; border-radius: 15px 15px 30px 30px; color: #fff; background: linear-gradient(135deg,var(--pocket-light),var(--pocket-dark) 80%); box-shadow: 0 17px 22px -16px #1e122b8c; }
  .pocket-front::before { position: absolute; inset: 0 0 auto; height: 6px; border-bottom: 1px solid #ffffff0c; background: #00000015; content: ''; }
  .pocket-stitch { position: absolute; pointer-events: none; inset: 9px; border: 1px dashed #ffffff20; border-radius: 9px 9px 23px 23px; }
  .pocket-front-top { position: relative; display: flex; justify-content: space-between; align-items: center; color: #ffffff64; }
  .pocket-wordmark { color: #ffffffdc; font-size: 15px; font-weight: 600; letter-spacing: -.6px; }
  .pocket-wordmark > span { color: var(--pocket-accent); }
  .pocket-balance { position: relative; display: grid; gap: 6px; margin: 13px 0 11px; }
  .pocket-balance > span { color: #ffffff9e; font-size: 9px; letter-spacing: .1px; }
  .pocket-balance strong { color: #fff; font-size: clamp(23px,2.3vw,32px); font-weight: 500; letter-spacing: -1px; line-height: 1.1; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .pocket-open-hint { position: relative; display: flex; justify-content: space-between; align-items: center; margin-top: auto; color: var(--pocket-accent); font-size: 9px; }
  .pocket-open-hint :global(svg) { transition: transform .2s; }
  .pocket-details[open] .pocket-open-hint :global(svg) { transform: rotate(180deg); }
  .pocket-details summary:hover .pocket-note { transform: translateY(-4px); }
  .pocket-account-list { display: grid; gap: 0; margin-top: 24px; border-top: 1px solid var(--line); }
  .pocket-account-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 2px; border-bottom: 1px solid var(--line); font-size: 11px; }
  .pocket-account-list > div > span { display: flex; align-items: center; gap: 8px; color: var(--muted); }
  .pocket-account-list i { width: 6px; height: 6px; border-radius: 50%; background: #36495e; }
  .pocket-account-list strong { color: var(--ink); font-size: 12px; font-weight: 550; text-align: right; overflow-wrap: anywhere; }
  .pocket-account-list > a { display: flex; justify-content: space-between; align-items: center; margin-top: 15px; color: var(--accent); font-size: 10px; text-decoration: none; }
  @media (max-width: 760px) { .wallet-pocket { padding: 21px 22px 25px; } h3 { font-size: 20px; } .pocket-balance strong { font-size: 29px; } .pocket-currencies button { min-height: 44px; min-width: 44px; } .pocket-manage { width: 44px; height: 44px; } }
  @media (max-width: 374px) { .wallet-pocket { padding-inline: 16px; } .pocket-note { padding-inline: 11px; } .pocket-note strong { font-size: 10px; } }
  @media (prefers-reduced-motion: reduce) { .pocket-note, .pocket-manage, .pocket-open-hint :global(svg) { transition: none; } }
</style>
