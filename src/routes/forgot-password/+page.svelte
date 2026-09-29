<script lang="ts">
	import { ArrowLeft, Mail } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Reset password — Budget</title></svelte:head>
<main class="simple-auth-page">
	<a class="back-link" href="/"><ArrowLeft size={17} /> Back to sign in</a>
	<section class="simple-card">
		<div class="simple-icon"><Mail size={22} /></div>
		<p class="eyebrow">Account recovery</p>
		<h1>Reset your password</h1>
		<p class="form-subtitle">We’ll send a secure reset link to your email address.</p>
		{#if !data.supabaseConfigured}<div class="form-message">Add your Supabase keys to `.env` first.</div>{/if}
		{#if form?.message}<div class="form-message" role="status">{form.message}</div>{/if}
		<form method="POST">
			<label for="email">Email address</label>
			<input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" value={form?.email ?? ''} required />
			<button class="primary-button" disabled={!data.supabaseConfigured}>Send reset link</button>
		</form>
	</section>
</main>
