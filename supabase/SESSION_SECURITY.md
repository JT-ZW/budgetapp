# Session rollout

Apply `migrations/0007_app_sessions.sql` in the Supabase SQL editor after the existing migrations, then deploy the application. Existing browser logins must sign in again. If the migration is missing or session verification fails, protected routes fail closed.

Sessions expire after ten minutes without mouse, keyboard, touch, or scrolling activity. Background polling does not extend a session. Activity is batched every 15 seconds and stored with its elapsed idle time. Tabs in the same browser share a session; activity in one keeps the others active. Server checks protect page loads and form actions, including when JavaScript is disabled. With JavaScript disabled, activity cannot renew the session.

Opening `/` always displays sign-in. A still-active session can access protected pages until it expires or is signed out. Cookies are HttpOnly, SameSite=Lax, Secure on HTTPS, and scoped to a browser session. Browser session restoration may preserve session cookies; the server inactivity limit still applies. Password changes revoke all application sessions.

## Supabase configuration

Configure these in the Supabase dashboard; they are not changed by this migration:

- Require email confirmation, use a minimum password length of 12, and enable leaked-password protection if available on your plan.
- Restrict the Site URL and redirect allowlist to the actual deployment and explicitly needed development URLs.
- Configure authentication rate limits and CAPTCHA for signup/password recovery where appropriate. The app uses Supabase's password authentication rate limiting; no unreliable in-memory limiter is added.
- Use HTTPS in production. Keep service-role and database credentials out of client environment variables and source control.

Application expiry is enforced by the SvelteKit server. Supabase access JWTs have their own expiry: sign-out revokes refresh tokens but does not immediately invalidate an already-issued access JWT. Existing database RLS remains the boundary for direct Supabase API requests. Configure Supabase session inactivity/token lifetimes as appropriate for your plan; this change does not claim to eliminate all data-leak risks or constitute a complete database security audit.

## Verification

Run `npm run check`, `npm run build`, and `npm run test:sessions`. Session tests use an isolated in-memory PostgreSQL instance.

After deployment, sign in, open two tabs, and leave both idle for ten minutes: private pages should lock and return to sign-in. Attempt a protected URL and form submission after expiry. Confirm that activity in one tab keeps both active, refreshing an idle page does not extend the session, and signing out in one tab expires the other on its next check. Check password recovery and confirm all previous sessions require sign-in after a password change.
