<script lang="ts">
	import '@fontsource-variable/manrope';
	import '../app.css';
	import '$lib/styles/refresh.css';
	import '$lib/styles/dark.css';
	import '$lib/styles/typography.css';
	import InvestmentOperationModal from '$lib/components/InvestmentOperationModal.svelte';
	import SessionMonitor from '$lib/components/SessionMonitor.svelte';
	import MobileNavigation from '$lib/components/MobileNavigation.svelte';
	let { children, data } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#0d141e" />
	<meta name="color-scheme" content="dark" />
	<meta name="description" content="A calm, clear view of your personal and project finances." />
</svelte:head>

{@render children()}
<InvestmentOperationModal />
{#if data.sessionExpiresAt}<MobileNavigation />{/if}
{#key data.sessionExpiresAt}
	<SessionMonitor expiresAt={data.sessionExpiresAt} />
{/key}
