import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { endSession, SESSION_COOKIE } from '$lib/server/session';

export const GET: RequestHandler = ({ locals }) => json({ expiresAt: locals.sessionExpiresAt });

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const idleMs = body?.idleMs;
  if (!Number.isInteger(idleMs) || idleMs < 0 || idleMs > 15000) {
    return json({ message: 'Invalid activity.' }, { status: 400 });
  }
  const { data, error } = await event.locals.supabase!.rpc('budget_app_session', {
    p_id: event.cookies.get(SESSION_COOKIE), p_action: 'touch', p_idle_ms: idleMs
  });
  if (error) return json({ message: 'Session verification unavailable.' }, { status: 503 });
  if (!data) {
    await endSession(event);
    return json({ message: 'Session expired.' }, { status: 401 });
  }
  return json({ expiresAt: data });
};
