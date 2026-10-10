<script lang="ts">
	import '../app.css';
	import InvestmentOperationModal from '$lib/components/InvestmentOperationModal.svelte';
	let { children } = $props();
</script>

<svelte:head>
	<meta name="theme-color" content="#f5f7f4" />
	<meta name="description" content="A calm, clear view of your personal and project finances." />
</svelte:head>

{@render children()}
<InvestmentOperationModal />
