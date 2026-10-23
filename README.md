# Budget App

A personal and project budgeting app built with SvelteKit, Supabase, and Vercel. It supports USD and ZiG balances, transaction history, budget periods, savings targets, and mobile layouts.

## Supabase setup

Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env` for local development. Use the publishable key; never use or expose a Supabase secret/service-role key in the browser. `.env` is ignored by Git, and `.env.example` contains placeholders.

Run these files, in this order, in Supabase Dashboard > SQL Editor:

1. `supabase/SETUP_BUDGET_APP.sql`
2. `supabase/PROJECT_WALLET_CURRENCIES.sql`
3. `supabase/BUDGET_PERIODS_AND_SAVINGS.sql`
4. `supabase/migrations/0002_investments.sql`
5. `supabase/migrations/0003_investment_opening_balances.sql`
6. `supabase/migrations/0004_stock_purchase_workflows.sql`
7. `supabase/migrations/0005_stock_brokerage_purchases.sql`
8. `supabase/migrations/0006_credit.sql`
9. `supabase/migrations/0007_app_sessions.sql`
10. `supabase/migrations/0008_restrict_anonymous_access.sql`

Credit tracks external loans and same-currency borrowing between your wallets. Recording borrowing moves cash immediately without counting principal as income. Add custom instalment amounts and dates, change the final repayment date, and record partial or early payments. Payments cover scheduled instalments in due-date order; any unscheduled balance is due on the final repayment date. Removing an instalment changes the plan only and preserves payment history. External loans support a manually entered fixed total for interest and fees; only paid charges count as expenses. Credit reminders appear on Overview and Budgets, and credit movements appear in Transactions. USD and ZiG remain separate. Apply migration 0006 once before using Credit; it builds on the existing wallet and investment migrations.

The Investments pages support manually managed stocks and forex accounts. Opening capital and existing holdings can be entered without changing personal wallet balances; later funding and withdrawals are recorded as transfers. Stock buys and sells retain FIFO purchase lots and charges, and daily prices and forex equity are entered manually. New stock purchases can debit a selected same-currency personal wallet for share value plus transfer charges as an investment transfer. Insights includes per-account performance summaries and growth histories.

In Supabase Authentication settings, allow the local callback URL and your deployed Vercel callback URL:

- `http://localhost:5173/auth/callback`
- `https://YOUR-DEPLOYED-DOMAIN/auth/callback`

## Run locally

```sh
npm install
npm run dev
```

Use Node.js 24. Before a production release, run `npm run verify` (type checks, all isolated tests, then production packaging). Configure the two Supabase public environment variables in Vercel for every environment you deploy. See [DEPLOYMENT.md](DEPLOYMENT.md) for the release steps and verification limits.

Run `npm test` for the full suite, including isolated PostgreSQL tests. PGlite is included as a development dependency; `npm ci` installs it. The tests never connect to live Supabase data.

Run `node scripts/test-credit-integration.mjs` to check the actual Credit, Wallets, Overview, Budgets, Transactions, and Insights loaders against one isolated database. This also verifies statement reconciliation, project reimbursements, long repayment histories, and modal success/error handling.
