import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, endSession } from '$lib/server/session';

const isConfigured =
  PUBLIC_SUPABASE_URL.startsWith('https://') &&
  !PUBLIC_SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
  PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') &&
  !PUBLIC_SUPABASE_PUBLISHABLE_KEY.includes('YOUR_KEY');

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.sessionExpiresAt = null;
  // Protect JSON endpoints too, including requests without a form content type.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
      event.request.headers.get('origin') !== event.url.origin) {
    error(403, 'Cross-origin requests are not allowed.');
  }
  if (isConfigured) {
    event.locals.supabase = createServerClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => event.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              // All Supabase access is server-side. Keep credentials out of JavaScript
              // and make authentication cookies expire when the browser session ends.
              const { maxAge, expires, ...sessionOptions } = options;
              event.cookies.set(name, value, {
                ...sessionOptions, ...(maxAge === 0 ? { maxAge: 0 } : {}),
                path: '/', httpOnly: true, sameSite: 'lax', secure: event.url.protocol === 'https:'
              });
            });
          }
        }
      }
    );
  } else {
    event.locals.supabase = null;
  }

  const publicRoute = ['/', '/forgot-password', '/auth/callback', '/logout'].includes(event.url.pathname);
  if (!publicRoute) {
    if (!event.locals.supabase) redirect(303, '/');
    const { data: auth, error: authError } = await event.locals.supabase.auth.getUser();
    const id = event.cookies.get(SESSION_COOKIE);
    if (authError || !auth.user || !id) {
      await endSession(event);
      if (event.url.pathname === '/session') return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      redirect(303, '/?auth=expired');
    }
    const { data, error: sessionError } = await event.locals.supabase.rpc('budget_app_session', {
      p_id: id, p_action: 'check'
    });
    if (sessionError) error(503, 'Session verification is unavailable. Please try again.');
    if (!data) {
      await endSession(event);
      if (event.url.pathname === '/session') return new Response(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
      redirect(303, '/?auth=expired');
    }
    event.locals.sessionExpiresAt = data;
  }
  const response = await resolve(event);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return response;
};
