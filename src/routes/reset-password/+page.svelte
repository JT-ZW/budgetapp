<script lang="ts">
  import Brand from '$lib/components/Brand.svelte';
	import { KeyRound } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>Choose a new password — Homwe</title></svelte:head>
<main class="simple-auth-page">
	<section class="simple-card">
		<div class="recovery-brand"><Brand href="/" full /></div>
		<div class="simple-icon"><KeyRound size={22} /></div>
		<p class="eyebrow">Account recovery</p>
		<h1>Choose a new password</h1>
		<p class="form-subtitle">Use at least 12 characters and keep it unique to this app.</p>
		{#if !data.supabaseConfigured}<div class="form-message">Add your Supabase keys to `.env` first.</div>{/if}
		{#if form?.message}<div class="form-message" role="alert">{form.message}</div>{/if}
		<form method="POST">
			<label for="password">New password</label>
			<input id="password" name="password" type="password" autocomplete="new-password" minlength="12" required />
			<label for="confirm-password">Confirm password</label>
			<input id="confirm-password" name="confirm_password" type="password" autocomplete="new-password" minlength="12" required />
			<button class="primary-button" disabled={!data.supabaseConfigured}>Update password</button>
		</form>
	</section>
</main>
