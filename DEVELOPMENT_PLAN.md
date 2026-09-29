# Budget App development checklist

## Foundation and first interface — in place

- [x] SvelteKit + TypeScript project with the Vercel adapter
- [x] Supabase browser/SSR packages and email/password auth routes
- [x] Email confirmation callback, password reset, logout, and protected overview
- [x] Responsive sign-in, recovery, and wallet overview screens
- [x] Owner-scoped schema for wallets, currency accounts, categories, ledger entries, and monthly targets
- [x] Personal defaults for USD and ZiG across EcoCash, Bank, and Cash; includes a migration backfill for existing users
- [x] Atomic project-wallet creation with USD and ZiG accounts
- [x] Transfer entries with optional source-currency fee and cross-currency rate
- [x] RLS-protected account balance function and exact-decimal money helpers

## Still needed for a solid first release

1. **Connect Supabase** — replace placeholders in `.env` with the project URL and publishable key. Add the local and production callback URLs in Supabase Auth settings.
2. **Apply and confirm the schema** — run `supabase/migrations/0001_initial_schema.sql` in the SQL Editor. Confirm signup creates the six Personal accounts and Transfer fees category.
3. **Transactions** — create, edit, filter, and remove income/expense entries; create transfers as one ledger entry; calculate optional fees; handle USD↔ZiG rates.
4. **Settings** — create/archive project wallets, manage categories, and set opening balances without breaking transaction history.
5. **Budgets and analysis** — monthly wallet and category caps/targets, cash-flow trends, category breakdowns, and separate USD/ZiG reporting.
6. **Release hardening** — type/build checks, money/transfer tests, accessibility and mobile review, Vercel environment variables, production deployment, and backup/recovery notes.

## Data rules already encoded

- USD and ZiG are reported separately; the app will not add unlike currencies into a combined total.
- A transfer is neither income nor spending. It changes the source and destination balances; its optional fee reduces the source balance and is categorized as an expense.
- Money is stored in exact decimal columns in Postgres and handled as integer minor units in the UI helpers.
- Row Level Security and owner-matched foreign keys keep each signed-in account's records separate.
- The Supabase URL and publishable key have not been entered; their values were checked without displaying them. Never put a secret/service-role key in public environment variables.

## Current review results

- `npm run check`: passed with 0 errors and 0 warnings.
- `npm run build`: Svelte client/server bundles compiled, but the Vercel adapter could not create its Windows symlink in `.vercel/output` (`EPERM`). This is a local Windows permission/platform limitation at the adapter packaging step; deployment builds on Vercel's environment still need to be confirmed.
- Live login and database behavior remain unverified until real Supabase keys are configured and the migration is applied.
