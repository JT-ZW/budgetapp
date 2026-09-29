import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.supabase) await locals.supabase.auth.signOut();
	redirect(303, '/');
};
