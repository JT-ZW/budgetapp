<script lang="ts">
  import type { loadCreditCommitments } from '$lib/server/credit';
  import { formatMoney } from '$lib/finance';
  import { creditMinor } from '$lib/credit';
  let { commitments }: { commitments: Awaited<ReturnType<typeof loadCreditCommitments>> } = $props();
</script>
<section class="section-block">
  <div class="section-heading"><div><p class="eyebrow">Plan ahead</p><h2>Credit repayments</h2><p class="section-caption">Amounts still due through this month, including overdue payments. Principal repayments are cash commitments and do not count as spending.</p></div><a href="/credit">Manage credit</a></div>
  {#if commitments.error}<p class="section-caption">Credit reminders could not be loaded. <a href="/credit">Open Credit for details.</a></p>
  {:else if commitments.rows.length}<div class="ledger-table-wrap"><table class="ledger-table"><thead><tr><th>Borrowing</th><th>Next due</th><th>Outstanding</th><th>Due through this month</th><th>Overdue</th></tr></thead><tbody>{#each commitments.rows as c}<tr><td><a href="/credit">{c.name}</a><small class="ledger-subline">{c.kind === 'internal' ? 'Internal reimbursement' : 'External loan'}</small></td><td>{c.nextDue}</td><td>{formatMoney(creditMinor(c.outstanding), c.currency)}</td><td>{formatMoney(creditMinor(c.due), c.currency)}</td><td>{formatMoney(creditMinor(c.overdue), c.currency)}</td></tr>{/each}</tbody></table></div>
  {:else}<p class="section-caption">No outstanding borrowing. <a href="/credit">Record a loan or borrow between wallets.</a></p>{/if}
</section>
