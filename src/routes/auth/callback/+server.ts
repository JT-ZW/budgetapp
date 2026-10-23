import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startSession } from '$lib/server/session';

export const GET: RequestHandler = async (event) => {
	const { locals, url } = event;
	const code = url.searchParams.get('code');
	const rawNext = url.searchParams.get('next') ?? '/dashboard';
	let next = '/dashboard';
	try {
		const candidate = new URL(rawNext, url.origin);
		if (candidate.origin === url.origin) next = `${candidate.pathname}${candidate.search}${candidate.hash}`;
	} catch {
		// Malformed redirect parameters must not break email confirmation/recovery.
	}
	if (!locals.supabase || !code) redirect(303, '/?auth=confirmation-failed');

	const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
	if (error) redirect(303, '/?auth=confirmation-failed');
	await startSession(event);
	redirect(303, next);
};
