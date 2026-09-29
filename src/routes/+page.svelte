<script lang="ts">
	import { WalletCards, ArrowRight, ShieldCheck } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let mode = $state<'login' | 'signup'>('login');
</script>

<svelte:head>
	<title>Budget — your money, in view</title>
</svelte:head>

<main class="auth-page">
	<section class="intro-panel" aria-label="About Budget">
		<a class="brand" href="/" aria-label="Budget home">
			<span class="brand-mark"><WalletCards size={22} strokeWidth={2.2} /></span>
			<span>Budget</span>
		</a>
		<div class="intro-copy">
			<p class="eyebrow">A clearer view of your money</p>
			<h1>Every wallet.<br /><em>One calm view.</em></h1>
			<p class="intro-description">Keep personal spending and project finances in their own places, while seeing the full picture whenever you need it.</p>
			<div class="currency-pills"><span>USD</span><span>ZiG</span><span>Personal + projects</span></div>
		</div>
		<p class="intro-foot"><ShieldCheck size={16} /> Private to your account, across your devices.</p>
	</section>

	<section class="form-panel" aria-labelledby="auth-title">
		<div class="form-wrap">
			<div class="mobile-brand brand"><span class="brand-mark"><WalletCards size={21} /></span><span>Budget</span></div>
			<p class="eyebrow">Welcome to your money space</p>
			<h2 id="auth-title">{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
			<p class="form-subtitle">{mode === 'login' ? 'Pick up where you left off.' : 'Set up your private budgeting space.'}</p>

			{#if !data.supabaseConfigured}
				<div class="notice" role="status">Add your Supabase Project URL and Publishable key in <code>.env</code> before signing in.</div>
			{/if}
			{#if form?.message}
				<div class:notice={form.mode === 'signup' && form.message.startsWith('Check your email')} class="form-message" role="status">{form.message}</div>
			{/if}

			<form method="POST" action={mode === 'login' ? '?/login' : '?/signup'}>
				<label for="email">Email address</label>
				<input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" value={form?.email ?? ''} required />

				<label for="password">Password</label>
				<input id="password" name="password" type="password" autocomplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" minlength="8" required />

				{#if mode === 'login'}
					<a class="forgot-link" href="/forgot-password">Forgot password?</a>
				{/if}

				<button class="primary-button" type="submit" disabled={!data.supabaseConfigured}>
					{mode === 'login' ? 'Sign in' : 'Create account'}
					<ArrowRight size={17} />
				</button>
			</form>

			<p class="switch-mode">
				{mode === 'login' ? 'New here?' : 'Already have an account?'}
				<button type="button" onclick={() => (mode = mode === 'login' ? 'signup' : 'login')}>
					{mode === 'login' ? 'Create an account' : 'Sign in'}
				</button>
			</p>
			<p class="legal-note">Your financial records are visible only to you.</p>
		</div>
	</section>
</main>
