import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, url }) => {
	const code = url.searchParams.get('code');
	const rawNext = url.searchParams.get('next') ?? '/dashboard';
	const candidate = new URL(rawNext, url.origin);
	const next = candidate.origin === url.origin ? `${candidate.pathname}${candidate.search}${candidate.hash}` : '/dashboard';
	if (!locals.supabase || !code) redirect(303, '/?auth=confirmation-failed');

	const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
	if (error) redirect(303, '/?auth=confirmation-failed');
	redirect(303, next);
};
