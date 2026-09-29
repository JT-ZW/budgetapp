# Budget App

A personal and project budgeting app built with SvelteKit, Supabase, and Vercel. It supports USD and ZiG balances, transaction history, budget periods, savings targets, and mobile layouts.

## Supabase setup

Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env` for local development. Use the publishable key; never use or expose a Supabase secret/service-role key in the browser. `.env` is ignored by Git, and `.env.example` contains placeholders.

Run these files, in this order, in Supabase Dashboard > SQL Editor:

1. `supabase/SETUP_BUDGET_APP.sql`
2. `supabase/PROJECT_WALLET_CURRENCIES.sql`
3. `supabase/BUDGET_PERIODS_AND_SAVINGS.sql`

In Supabase Authentication settings, allow the local callback URL and your deployed Vercel callback URL:

- `http://localhost:5173/auth/callback`
- `https://YOUR-DEPLOYED-DOMAIN/auth/callback`

## Run locally

```sh
npm install
npm run dev
```

Before a production release, run `npm run check` and `npm run build`. Configure the two Supabase public environment variables in Vercel for every environment you deploy.
