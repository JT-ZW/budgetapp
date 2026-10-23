import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endSession } from '$lib/server/session';

export const POST: RequestHandler = async (event) => {
	await endSession(event);
	redirect(303, '/');
};
