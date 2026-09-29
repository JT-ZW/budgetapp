import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => ({ supabaseConfigured: Boolean(locals.supabase) });

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.supabase) return fail(503, { message: 'Supabase is not configured yet.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		if (!email) return fail(400, { email, message: 'Enter your email address.' });

		const { error } = await locals.supabase.auth.resetPasswordForEmail(email, {
			redirectTo: `${url.origin}/auth/callback?next=/reset-password`
		});
		if (error) return fail(400, { email, message: 'We could not send the reset email. Try again shortly.' });
		return { email, message: 'If an account exists for that email, a reset link is on its way.' };
	}
};
