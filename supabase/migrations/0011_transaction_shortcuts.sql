-- Manually confirmed reusable income and spending entries.
create table if not exists public.budget_app_transaction_shortcuts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind public.budget_app_transaction_kind not null check (kind in ('income', 'expense')),
  amount numeric(18,2) not null check (amount > 0),
  account_id uuid not null,
  category_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (account_id, owner_id) references public.budget_app_wallet_accounts(id, owner_id),
  foreign key (category_id, owner_id) references public.budget_app_categories(id, owner_id)
);
create index if not exists budget_app_shortcuts_owner_idx on public.budget_app_transaction_shortcuts(owner_id);
alter table public.budget_app_transaction_shortcuts enable row level security;
revoke all on public.budget_app_transaction_shortcuts from anon, public;
grant select, insert, update, delete on public.budget_app_transaction_shortcuts to authenticated;
drop policy if exists shortcuts_owner_access on public.budget_app_transaction_shortcuts;
create policy shortcuts_owner_access on public.budget_app_transaction_shortcuts
  for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
-- Retrying a confirmation must not duplicate its ledger entry.
alter table public.budget_app_transactions add column if not exists shortcut_request_id uuid;
create unique index if not exists budget_app_transactions_shortcut_request_unique
  on public.budget_app_transactions(owner_id, shortcut_request_id) where shortcut_request_id is not null;
