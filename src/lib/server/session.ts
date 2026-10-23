import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

export const SESSION_COOKIE = 'budget_app_session';

export async function startSession(event: RequestEvent) {
  const id = crypto.randomUUID();
  const { data, error: sessionError } = await event.locals.supabase!.rpc('budget_app_session', {
    p_id: id, p_action: 'start'
  });
  if (sessionError || !data) {
    await event.locals.supabase!.auth.signOut({ scope: 'local' });
    error(503, 'Unable to establish a secure session. Please try again.');
  }
  event.cookies.set(SESSION_COOKIE, id, {
    path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:'
  });
}

export async function endSession(event: RequestEvent) {
  const id = event.cookies.get(SESSION_COOKIE);
  if (id && event.locals.supabase) {
    await event.locals.supabase.rpc('budget_app_session', { p_id: id, p_action: 'end' });
  }
  event.cookies.delete(SESSION_COOKIE, { path: '/' });
  if (event.locals.supabase) await event.locals.supabase.auth.signOut({ scope: 'local' });
}
