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

The Investments pages support manually managed stocks and forex accounts. Opening capital and existing holdings can be entered without changing personal wallet balances; later funding and withdrawals are recorded as transfers. Stock buys and sells retain FIFO purchase lots and charges, and daily prices and forex equity are entered manually. New stock purchases can debit a selected same-currency personal wallet for share value plus transfer charges as an investment transfer. Insights includes per-account performance summaries and growth histories.

In Supabase Authentication settings, allow the local callback URL and your deployed Vercel callback URL:

- `http://localhost:5173/auth/callback`
- `https://YOUR-DEPLOYED-DOMAIN/auth/callback`

## Run locally

```sh
npm install
npm run dev
```

Before a production release, run `npm run check` and `npm run build`. Configure the two Supabase public environment variables in Vercel for every environment you deploy.
