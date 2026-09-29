import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.supabase) return { supabaseConfigured: false };
	const { data, error } = await locals.supabase.auth.getUser();
	if (!error && data.user) redirect(303, '/dashboard');
	return { supabaseConfigured: true };
};

export const actions: Actions = {
	login: async ({ request, locals }) => {
		if (!locals.supabase) return fail(503, { mode: 'login', message: 'Add your Supabase project URL and publishable key to .env first.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { mode: 'login', email, message: 'Enter your email and password.' });

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) return fail(400, { mode: 'login', email, message: 'Email or password did not match.' });
		redirect(303, '/dashboard');
	},

	signup: async ({ request, locals, url }) => {
		if (!locals.supabase) return fail(503, { mode: 'signup', message: 'Add your Supabase project URL and publishable key to .env first.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!email || password.length < 8) {
			return fail(400, { mode: 'signup', email, message: 'Enter an email and a password with at least 8 characters.' });
		}

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: { emailRedirectTo: `${url.origin}/auth/callback?next=/dashboard` }
		});
		if (error) return fail(400, { mode: 'signup', email, message: 'Could not create the account. Check your details and try again.' });
		if (data.session) redirect(303, '/dashboard');
		return { mode: 'signup', email, message: 'Check your email to confirm your account, then sign in.' };
	}
};
