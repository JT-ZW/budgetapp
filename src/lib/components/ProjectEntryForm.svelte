<script lang="ts">
  import { enhance } from '$app/forms';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  import DatePicker from '$lib/components/DatePicker.svelte';
  let { historical = false, accounts, categories, requestId, startedOn, today }: { historical?: boolean; accounts: {id: string; label: string; active: boolean}[]; categories: {id: string; name: string; kind: string}[]; requestId: string; startedOn: string; today: string } = $props();
  let classification = $state('opex');
</script>
<form method="POST" action={historical ? '?/historical' : '?/record'} class="feature-form" use:enhance={handleInvestmentSubmit}>
  <input type="hidden" name="request_id" value={requestId}/>
  <label>Activity<select name="classification" bind:value={classification}><option value="opex">Operating expenditure</option><option value="capex">Capital expenditure</option><option value="revenue">Revenue earned</option></select></label>
  <label>{historical ? 'Currency / project account' : 'Project account'}<select name="account_id" required><option value="">Choose account</option>{#each accounts.filter((a) => a.active) as account}<option value={account.id}>{account.label}</option>{/each}</select></label>
  <label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0.00" required/></label>
  <label>Date<DatePicker name="occurred_on" value={historical ? startedOn : today} min={historical ? undefined : startedOn} max={historical ? startedOn : today} required/></label>
  {#if !historical}<label>Category<select name="category_id" required><option value="">Choose a matching category</option>{#each categories.filter((c) => c.kind === (classification === 'revenue' ? 'income' : 'expense')) as category}<option value={category.id}>{category.name}</option>{/each}</select></label>{/if}
  <label class="form-wide">Description<input name="description" maxlength="240" placeholder={historical ? 'e.g. Equipment bought before digital records' : 'What was this for?'} required/></label>
  <div class="form-wide form-footer"><p>{historical ? 'History only: this adds to project reports and does not change wallet cash. Do not enter items already selected from the wallet.' : 'This records one wallet transaction and its project classification together.'}</p><button class="primary-button" type="submit">{historical ? 'Add opening history' : 'Record project entry'}</button></div>
</form>
