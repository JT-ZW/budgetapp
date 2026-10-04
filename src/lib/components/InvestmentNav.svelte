<script lang="ts">
  let { active }: { active: string } = $props();
  const links = [
    { id: 'overview', label: 'Overview', href: '/investments' },
    { id: 'accounts', label: 'Accounts', href: '/investments/accounts' },
    { id: 'stocks', label: 'Stocks', href: '/investments/stocks' },
    { id: 'forex', label: 'Forex', href: '/investments/forex' },
    { id: 'transfers', label: 'Transfers', href: '/investments/transfers' }
  ];
</script>

<nav class="investment-subnav" aria-label="Investment sections">
  {#each links as link}
    <a href={link.href} class:active={active === link.id} aria-current={active === link.id ? 'page' : undefined}>{link.label}</a>
  {/each}
</nav>
