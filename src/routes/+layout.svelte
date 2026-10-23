<script lang="ts">
	import '@fontsource-variable/manrope';
	import '../app.css';
	import '$lib/styles/refresh.css';
	import '$lib/styles/dark.css';
	import '$lib/styles/typography.css';
	import '$lib/styles/brand.css';
	import InvestmentOperationModal from '$lib/components/InvestmentOperationModal.svelte';
	import SessionMonitor from '$lib/components/SessionMonitor.svelte';
	import MobileNavigation from '$lib/components/MobileNavigation.svelte';
	import Brand from '$lib/components/Brand.svelte';
	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="64x64" href="/favicon.png" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<meta name="application-name" content="Homwe" />
	<meta name="theme-color" content="#0d141e" />
	<meta name="color-scheme" content="dark" />
	<meta name="description" content="A calm, clear view of your personal and project finances." />
</svelte:head>

{#if data.sessionExpiresAt}<div class="mobile-app-brand"><Brand /></div>{/if}
{@render children()}
<InvestmentOperationModal />
{#if data.sessionExpiresAt}<MobileNavigation />{/if}
{#key data.sessionExpiresAt}
	<SessionMonitor expiresAt={data.sessionExpiresAt} />
{/key}
