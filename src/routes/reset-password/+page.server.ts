import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { endSession, SESSION_COOKIE } from '$lib/server/session';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.supabase) return { supabaseConfigured: false };
	const { data, error } = await locals.supabase.auth.getUser();
	if (error || !data.user) redirect(303, '/');
	return { supabaseConfigured: true };
};

export const actions: Actions = {
	default: async (event) => {
		const { request, locals } = event;
		if (!locals.supabase) return fail(503, { message: 'Supabase is not configured yet.' });
		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirmPassword = String(form.get('confirm_password') ?? '');
		if (password.length < 12) return fail(400, { message: 'Use at least 12 characters.' });
		if (password !== confirmPassword) return fail(400, { message: 'The passwords do not match.' });

		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) return fail(400, { message: 'Password could not be updated. Request a new reset link and try again.' });
		const { error: revokeError } = await locals.supabase.rpc('budget_app_session', {
			p_id: event.cookies.get(SESSION_COOKIE), p_action: 'endAll'
		});
		await endSession(event);
		if (revokeError) return fail(503, { message: 'Password changed, but session revocation could not be confirmed. Sign in and try again.' });
		redirect(303, '/?auth=password-changed');
	}
};
