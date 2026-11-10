<script lang="ts">
  import ProjectShell from '$lib/components/ProjectShell.svelte';
  import { FolderKanban, ArrowUpRight, Link2, Plus } from 'lucide-svelte';
  import { enhance } from '$app/forms';
  import { handleInvestmentSubmit } from '$lib/investments/feedback';
  import { projectMoney } from '$lib/projects';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
  const eligibleWallets = $derived(data.groups.filter((group) => group.kind === 'project' && !group.archived_at && !data.projects.some((p) => p.wallet_group_id === group.id)));
</script>
<svelte:head><title>Projects - Homwe</title></svelte:head>
<ProjectShell>
  <section class="welcome-row"><div><p class="eyebrow">Make the money work</p><h1>Your projects, <span class="accent-period">in focus.</span></h1><p class="welcome-copy">See what funds each project, what it costs, and what it earns.</p></div><a class="primary-button" href="#connect-project"><Plus size={17}/> Connect a project</a></section>
  {#if data.loadError}<div class="setup-banner" role="alert"><div><strong>Projects are unavailable</strong><p>The Projects database update must be installed before this section can be used. Your existing wallets are available as usual.</p><a href="/wallets">Open wallets</a></div></div>{/if}
  {#if form?.message}<p class="form-alert" role="alert">{form.message}</p>{/if}
  {#if !data.loadError}
    <section class="project-grid" aria-label="Your projects">
      {#each data.projects as project}<a class="project-card" href={`/projects/${project.id}`}>
        <div class="project-card-top"><span class="project-mark"><FolderKanban size={23}/></span><span class="project-state">{!project.setup_completed ? 'Finish setup' : project.status === 'completed' ? 'Completed' : 'Active'}</span><ArrowUpRight size={20}/></div>
        <h2>{project.name}</h2><p>{project.walletName}{!project.walletActive ? ' (archived)' : ''}</p>
        {#each project.totals as total}<div class="project-currency"><div><span>Wallet cash / {total.currency === 'ZIG' ? 'ZiG' : total.currency}</span><strong>{projectMoney(total.cash, total.currency)}</strong></div><dl><div><dt>Capital costs</dt><dd>{projectMoney(total.capex, total.currency)}</dd></div><div><dt>Operating costs</dt><dd>{projectMoney(total.opex, total.currency)}</dd></div><div><dt>Revenue</dt><dd>{projectMoney(total.revenue, total.currency)}</dd></div></dl></div>{/each}
        <span class="project-open">{project.setup_completed ? 'Open project' : 'Review opening history'} <ArrowUpRight size={15}/></span>
      </a>{:else}<div class="empty-card"><span class="empty-icon"><FolderKanban size={26}/></span><h2>Give your project its own space</h2><p>Connect an existing wallet, review past costs and revenue, then start recording daily activity.</p></div>{/each}
    </section>
    <section class="section-block" id="connect-project"><div class="section-heading"><div><p class="eyebrow">Start with what you have</p><h2>Connect a project</h2><p class="section-caption">Your wallet keeps its balance and history. Each project gets one dedicated wallet.</p></div><Link2 size={22}/></div>
      {#if eligibleWallets.length}<form class="feature-form" method="POST" action="?/create" use:enhance={handleInvestmentSubmit}>
        <input type="hidden" name="request_id" value={data.requestId}/>
        <label>Project name<input name="name" maxlength="80" placeholder="e.g. BeVisioneers garden" required/></label>
        <label>Connect wallet<select name="wallet_group_id" required><option value="">Choose an existing project wallet</option>{#each eligibleWallets as wallet}<option value={wallet.id}>{wallet.name}</option>{/each}</select></label>
        <label class="form-wide">About this project<input name="description" maxlength="1000" placeholder="What are you building or running?"/></label>
        <div class="form-wide form-footer"><p>Next: choose past wallet entries to carry over, or add opening history. Linking creates no new cash.</p><button class="primary-button" type="submit">Connect and review history <ArrowUpRight size={17}/></button></div>
      </form>{:else}<div class="empty-card"><h3>No unassigned project wallets</h3><p>Create a wallet in Settings, then connect it here. Personal remains a funding source.</p><a class="primary-button" href="/settings">Set up a project wallet</a></div>{/if}
    </section>
  {/if}
</ProjectShell>
<style>
  .project-grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(min(100%,340px),1fr)); gap: 20px; margin-bottom: 36px; }
  .project-card { display: block; padding: 24px; color: var(--ink); text-decoration: none; border: 1px solid var(--line); border-radius: 20px; background: var(--surface); transition: border-color .15s; }
  .project-card:hover { border-color: var(--accent); }
  .project-card-top { display: flex; align-items: center; gap: 12px; }
  .project-mark { width: 46px; height: 46px; display: grid; place-items: center; border-radius: 12px; background: var(--accent-soft); color: var(--accent); }
  .project-state { flex: 1; color: var(--muted); font-size: .75rem; }
  .project-card h2 { margin: 20px 0 6px; font-size: 1.35rem; overflow-wrap: anywhere; }
  .project-card>p { color: var(--muted); margin: 0 0 20px; font-size: .85rem; }
  .project-currency { padding: 16px 0; border-top: 1px solid var(--line); }
  .project-currency>div { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; align-items: baseline; }
  .project-currency span { color: var(--muted); font-size: .75rem; }
  .project-currency strong { font-size: 1.35rem; }
  dl { margin: 16px 0 0; display: grid; gap: 10px; }
  dl div { display: flex; justify-content: space-between; gap: 10px; font-size: .8rem; }
  dt { color: var(--muted); } dd { margin: 0; }
  .project-open { display: flex; gap: 8px; align-items: center; color: var(--accent); font-size: .8rem; font-weight: 650; padding-top: 12px; }
  @media (prefers-reduced-motion: reduce) { .project-card { transition: none; } }
</style>
