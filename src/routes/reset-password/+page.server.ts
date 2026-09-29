import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.supabase) return { supabaseConfigured: false };
	const { data, error } = await locals.supabase.auth.getUser();
	if (error || !data.user) redirect(303, '/');
	return { supabaseConfigured: true };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.supabase) return fail(503, { message: 'Supabase is not configured yet.' });
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirmPassword = String(form.get('confirm_password') ?? '');
		if (password.length < 8) return fail(400, { message: 'Use at least 8 characters.' });
		if (password !== confirmPassword) return fail(400, { message: 'The passwords do not match.' });

		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) return fail(400, { message: 'Password could not be updated. Request a new reset link and try again.' });
		redirect(303, '/dashboard');
	}
};
