<script lang="ts">
  import { decimalToMinorUnits, formatMoney } from '$lib/finance';
  import type { Currency } from '$lib/types/finance';
  let { categories, currency, total }: {
    categories: { name: string; amount: string }[]; currency: Currency; total: string;
  } = $props();
  const colors = ['#6fd3b0', '#e6b56e', '#739fdf', '#a996df', '#e68d97'];
  const segments = $derived.by(() => {
    const sum = Number(total);
    let offset = 0;
    return categories.map((category, index) => {
      const share = sum > 0 ? Number(category.amount) / sum * 100 : 0;
      const segment = { ...category, share, offset, color: colors[index % colors.length] };
      offset += share;
      return segment;
    });
  });
</script>

<div class="spending-visual">
  <div class="spending-ring">
    <svg viewBox="0 0 200 200" role="img" aria-label={`${currency} spending by category`}>
      <circle cx="100" cy="100" r="79" fill="none" stroke="var(--surface-raised)" stroke-width="15"/>
      {#each segments as segment}
        <circle cx="100" cy="100" r="79" fill="none" stroke={segment.color} stroke-width="15" pathLength="100"
          stroke-dasharray={`${Math.max(0, segment.share - (segments.length > 1 ? 2 : 0))} 100`}
          stroke-dashoffset={-segment.offset} stroke-linecap="round" transform="rotate(-90 100 100)">
          <title>{segment.name}: {formatMoney(decimalToMinorUnits(segment.amount), currency)} ({segment.share.toFixed(1)}%)</title>
        </circle>
      {/each}
    </svg>
    <div class="ring-total"><span>Spent this month</span><strong>{formatMoney(decimalToMinorUnits(total), currency)}</strong><small>{currency === 'ZIG' ? 'ZiG' : currency}</small></div>
  </div>
  <div class="spending-legend">
    {#each segments as segment}
      <div title={`${segment.name}: ${formatMoney(decimalToMinorUnits(segment.amount), currency)}`}><i style={`background:${segment.color}`}></i><span>{segment.name}</span><strong>{segment.share < 1 ? '<1' : segment.share.toFixed(0)}%</strong></div>
    {:else}
      <p>No spending yet. Your categories will appear here as you record expenses.</p>
    {/each}
  </div>
</div>
