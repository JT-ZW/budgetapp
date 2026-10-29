# Release preparation — 22 October 2026

## Lending and custom budgets — 29 October 2026

Migrations `0009_lending.sql` and `0010_custom_budget_periods.sql` were installed together in the configured Supabase database and verified with a read-only metadata check. Existing financial records were preserved. This update did not deploy the application or apply the previously documented migration 0008 permission cleanup.

Source checks passed with zero errors/warnings. The full isolated suite passed, including lending disbursements, repayments into another wallet, instalment allocation, settlement, overpayment/currency rejection, statement reconciliation, and exclusion from income/spending and debt commitments. Custom budget tests cover saving/updating, distinct end dates, inclusive boundaries, cross-year totals, more than 1,000 transactions, invalid dates, and upcoming/completed targets.

Client/server production compilation passed; Vercel packaging remains blocked by Windows filesystem permissions. Native browser access timed out, so desktop/mobile visual acceptance remains outstanding. The feature migration installer is `node --env-file=.env scripts/migrate-lending-budgets.mjs` (metadata check) or the same command with `--apply` (transactional installation).

The application is prepared for a preview release, subject to the remaining gates below. No live database changes or deployment were performed during this review.

## Verified

- Svelte and TypeScript checks: no errors or warnings.
- Isolated PostgreSQL tests: external/internal borrowing, instalments, partial/early payments, atomic failures, owner isolation, permissions, cash conservation and expense classification.
- Actual financial page loaders: statements reconcile; principal stays outside income/spending; investment funding stays separate; histories load beyond 1,000 records.
- Session tests: ten-minute expiry, activity renewal, no revival after expiry, revocation, owner isolation, cross-origin rejection and failure to verify denying access.
- Dashboard tests: exact totals, separate currencies, transfer fees, categories and empty/error states.
- Both database setup paths pass the new permission-hardening tests, including Supabase-style default anonymous grants.
- Read-only local HTTP checks: public pages, security headers, all 14 protected page URLs, unauthorized session checks and malformed callbacks.
- Dependency audit: zero reported vulnerabilities at review time.

## Required database change

The read-only live metadata audit confirmed all 16 application tables have RLS, and the Credit and Sessions objects exist. It also found unnecessary anonymous privileges on 12 tables and three wallet function signatures. Owner policies remain present; these grants alone do not establish that a data leak occurred.

Apply **`supabase/migrations/0008_restrict_anonymous_access.sql`** before release. This removes PUBLIC/anonymous grants only from `budget_app_` tables/functions. It preserves authenticated grants and RLS policies, changes no financial rows, and is safe to rerun. Its behavior is tested against both the migration and SQL-editor setup paths.

For a fresh database, use either the migration path from `0001` through `0008`, or the README's SQL-editor setup order. For an existing database, apply only missing migrations in order. Do not rerun older migrations that create existing objects. Future migrations must explicitly restrict anonymous grants; rerun the audit afterward.

The optional audit requires a private administrator connection locally:

```sh
node --env-file=.env scripts/check-database-security.mjs
```

It opens a read-only transaction and prints metadata, not user or financial records. Do not place `SUPABASE_DB_URL` in a `PUBLIC_` variable or expose it to the browser.

## Build and Vercel settings

Use Node.js **24.x**, matching `package.json`, the adapter runtime and CI.

```sh
npm ci
npm run verify
```

`verify` runs source checks, the complete isolated test suite, and production packaging. The GitHub Actions workflow runs this on Ubuntu with placeholder Supabase variables; it uses no production secrets and does not deploy. Require a successful Linux CI or Vercel preview build before promotion.

Local client/server compilation succeeds. Full Windows packaging is blocked by `EPERM` when the Vercel adapter creates function symlinks. The Linux workflow is prepared but has not been run remotely; it is not evidence of a successful release build yet.

In Vercel, use the SvelteKit framework preset and `npm run build`, with:

- `PUBLIC_SUPABASE_URL`: the correct project's HTTPS URL.
- `PUBLIC_SUPABASE_PUBLISHABLE_KEY`: that project's publishable key.

Set these for each intended environment and rebuild after changing them: the app reads static environment variables at build time. Private database/service-role credentials are not needed by the application runtime.

## Supabase and preview acceptance

Confirm the production Site URL, the exact allowed callback URLs, email confirmation, password recovery email delivery, minimum password length, authentication rate limits and any available leaked-password protection. These dashboard settings have not been verified by this review.

Use a staging account/database for acceptance checks. Confirm signup, confirmation, sign-in, recovery, logout and two-tab inactivity expiry. Test wallets, transactions, budgets, investment workflows, credit repayments and statement exports using disposable staging records. Test with a second user to confirm record isolation.

Check the preview at widths 320, 375, 390, 768 and 1440 pixels. Include forms and date inputs, wallet currency switches, expandable pockets, More navigation, dialogs and long financial values. Wide tables should scroll within their containers. Browser-based desktop/mobile interaction and visual review are still outstanding because no browser connection was available.

Application expiry is enforced by SvelteKit. Existing Supabase access JWTs retain their separate expiry; RLS remains the boundary for direct database API access. See [SESSION_SECURITY.md](supabase/SESSION_SECURITY.md).

## Promotion gates

1. Apply migration 0008 and rerun the live read-only audit with zero issues.
2. Obtain a successful Linux CI or Vercel preview build.
3. Complete preview authentication, financial-workflow and mobile acceptance checks.

Promote only after these pass. Retain the last working Vercel deployment for application rollback; migration 0008 can remain applied if the application is rolled back.
