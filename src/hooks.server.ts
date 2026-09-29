import { PUBLIC_SUPABASE_PUBLISHABLE_KEY, PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

const isConfigured =
  PUBLIC_SUPABASE_URL.startsWith('https://') &&
  !PUBLIC_SUPABASE_URL.includes('YOUR_PROJECT_REF') &&
  PUBLIC_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_') &&
  !PUBLIC_SUPABASE_PUBLISHABLE_KEY.includes('YOUR_KEY');

export const handle: Handle = async ({ event, resolve }) => {
  if (isConfigured) {
    event.locals.supabase = createServerClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        cookies: {
          getAll: () => event.cookies.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              event.cookies.set(name, value, { ...options, path: '/' });
            });
          }
        }
      }
    );
  } else {
    event.locals.supabase = null;
  }

  const response = await resolve(event);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  return response;
};
