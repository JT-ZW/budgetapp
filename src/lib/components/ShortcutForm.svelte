<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  let { accounts, categories, shortcut }: {
    accounts: { id: string; group_name: string; currency: string; channel: string | null }[];
    categories: { id: string; name: string; kind: string }[];
    shortcut?: { id: string; name: string; kind: string; amount: number | string; account_id: string; category_id: string };
  } = $props();
  let kind = $state(untrack(() => shortcut?.kind ?? 'expense'));
  $effect(() => { kind = shortcut?.kind ?? 'expense'; });
</script>

<form method="POST" action="?/saveShortcut" class="feature-form" use:enhance={handleInvestmentSubmit}>
  {#if shortcut}<input type="hidden" name="id" value={shortcut.id}/>{/if}
  <label>Shortcut name<input name="name" maxlength="80" value={shortcut?.name ?? ''} placeholder="e.g. Transport to work" required/></label>
  <label>Type<select name="kind" bind:value={kind}><option value="expense">Spending</option><option value="income">Income</option></select></label>
  <label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" value={shortcut?.amount ?? ''} placeholder="0.00" required/></label>
  <label>Wallet account<select name="account_id" value={shortcut?.account_id ?? ''} required><option value="" disabled>Choose a wallet account</option>{#each accounts as account}<option value={account.id}>{account.group_name} · {account.currency === 'ZIG' ? 'ZiG' : account.currency}{account.channel ? ` · ${account.channel === 'ecocash' ? 'EcoCash' : account.channel === 'bank' ? 'Bank' : 'Cash'}` : ''}</option>{/each}</select></label>
  <label>Category<select name="category_id" value={shortcut?.kind === kind ? shortcut.category_id : ''} required><option value="" disabled>Choose a category</option>{#each categories.filter((category) => category.kind === kind) as category}<option value={category.id}>{category.name}</option>{/each}</select></label>
  <div class="form-wide form-footer"><p>The amount uses the selected wallet's currency.</p><button class="primary-button" type="submit">{shortcut ? 'Save changes' : 'Create shortcut'}</button></div>
</form>
