import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { startSession } from '$lib/server/session';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.supabase) return { supabaseConfigured: false };
	return { supabaseConfigured: true };
};

export const actions: Actions = {
	login: async (event) => {
		const { request, locals } = event;
		if (!locals.supabase) return fail(503, { mode: 'login', message: 'Add your Supabase project URL and publishable key to .env first.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { mode: 'login', email, message: 'Enter your email and password.' });

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) return fail(400, { mode: 'login', email, message: 'Email or password did not match.' });
		await startSession(event);
		redirect(303, '/dashboard');
	},

	signup: async (event) => {
		const { request, locals, url } = event;
		if (!locals.supabase) return fail(503, { mode: 'signup', message: 'Add your Supabase project URL and publishable key to .env first.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!email || password.length < 12) {
			return fail(400, { mode: 'signup', email, message: 'Enter an email and a password with at least 12 characters.' });
		}

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: { emailRedirectTo: `${url.origin}/auth/callback?next=/dashboard` }
		});
		if (error) return fail(400, { mode: 'signup', email, message: 'Could not create the account. Check your details and try again.' });
		if (data.session) {
			await startSession(event);
			redirect(303, '/dashboard');
		}
		return { mode: 'signup', email, message: 'Check your email to confirm your account, then sign in.' };
	}
};
