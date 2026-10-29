<script lang="ts">
  import Brand from '$lib/components/Brand.svelte';
  import { page } from '$app/state';
  import { Home, WalletCards, ArrowLeftRight, Grid2X2, ChartPie, TrendingUp, Target, CreditCard, Settings2, LogOut, X, ChevronRight } from 'lucide-svelte';
  let menu: HTMLDialogElement;
  const primary = [
    { href: '/dashboard', label: 'Home', icon: Home },
    { href: '/wallets', label: 'Wallets', icon: WalletCards },
    { href: '/transactions', label: 'Activity', icon: ArrowLeftRight }
  ];
  const more = [
    { href: '/insights', label: 'Insights', detail: 'Understand your money', icon: ChartPie },
    { href: '/budgets', label: 'Budgets', detail: 'Make room for your goals', icon: Target },
    { href: '/investments', label: 'Investments', detail: 'Keep an eye on growth', icon: TrendingUp },
    { href: '/credit', label: 'Credit', detail: 'Borrowing, lending and repayments', icon: CreditCard },
    { href: '/settings', label: 'Settings', detail: 'Your wallets and preferences', icon: Settings2 }
  ];
  const active = (href: string) => page.url.pathname === href || page.url.pathname.startsWith(`${href}/`);
  $effect(() => {
    page.url.pathname;
    menu?.close();
  });
</script>

<nav class="app-mobile-nav" aria-label="Main navigation">
  {#each primary as item}
    <a href={item.href} class:current={active(item.href)} aria-current={active(item.href) ? 'page' : undefined}>
      <span><item.icon size={22} strokeWidth={1.7}/></span>{item.label}
    </a>
  {/each}
  <button type="button" class:current={more.some((item) => active(item.href))} onclick={() => menu.showModal()} aria-label="More sections" aria-haspopup="dialog">
    <span><Grid2X2 size={22} strokeWidth={1.7}/></span>More
  </button>
</nav>

<dialog bind:this={menu} class="navigation-sheet" aria-labelledby="navigation-title">
  <div class="sheet-handle"></div>
  <header><div><Brand /><h2 id="navigation-title">Explore Homwe</h2></div><button class="icon-button" type="button" onclick={() => menu.close()} aria-label="Close menu"><X size={20}/></button></header>
  <nav aria-label="More sections">
    {#each more as item}
      <a href={item.href} onclick={() => menu.close()} aria-current={active(item.href) ? 'page' : undefined}>
        <span class="sheet-icon"><item.icon size={21}/></span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ChevronRight size={17}/>
      </a>
    {/each}
  </nav>
  <form method="POST" action="/logout"><button class="sheet-signout"><LogOut size={18}/> Sign out</button></form>
</dialog>
