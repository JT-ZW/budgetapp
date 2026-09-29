-- Budget App setup for Supabase SQL Editor
-- Safe alongside legacy project tables: all app objects use the budget_app_ prefix.
-- This script does not delete existing tables or user data. It is safe to rerun.
-- Paste the complete file into Supabase Dashboard > SQL Editor and run it as project owner.
-- The script creates the app tables, access policies, wallet bootstrap, and balance RPC.
-- Budget App core schema
-- Currency values are stored as exact decimal amounts, never floating-point numbers.

create extension if not exists pgcrypto;

do $$ begin
  create type public.budget_app_wallet_group_kind as enum ('personal', 'project');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.budget_app_wallet_channel as enum ('ecocash', 'bank', 'cash');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.budget_app_transaction_kind as enum ('income', 'expense', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.budget_app_category_kind as enum ('income', 'expense');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.budget_app_budget_goal_kind as enum ('spending_cap', 'income_target', 'savings_target');
exception when duplicate_object then null; end $$;

create table if not exists public.budget_app_wallet_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind public.budget_app_wallet_group_kind not null,
  created_at timestamptz not null default now(),
  constraint wallet_groups_id_owner_unique unique (id, owner_id)
);

create unique index if not exists budget_app_wallet_groups_one_personal_per_owner
  on public.budget_app_wallet_groups (owner_id) where kind = 'personal';
create unique index if not exists budget_app_wallet_groups_owner_name_unique
  on public.budget_app_wallet_groups (owner_id, lower(name));

create table if not exists public.budget_app_wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wallet_group_id uuid not null,
  currency text not null check (currency in ('USD', 'ZIG')),
  channel public.budget_app_wallet_channel,
  opening_balance numeric(18, 2) not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint wallet_accounts_id_owner_unique unique (id, owner_id),
  constraint wallet_accounts_group_owner_fkey
    foreign key (wallet_group_id, owner_id)
    references public.budget_app_wallet_groups (id, owner_id) on delete cascade,
  constraint wallet_accounts_opening_balance_check check (opening_balance >= 0)
);

create unique index if not exists budget_app_wallet_accounts_group_currency_channel_unique
  on public.budget_app_wallet_accounts (wallet_group_id, currency, channel) where channel is not null;
create unique index if not exists budget_app_wallet_accounts_group_currency_project_unique
  on public.budget_app_wallet_accounts (wallet_group_id, currency) where channel is null;

create table if not exists public.budget_app_categories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  kind public.budget_app_category_kind not null,
  created_at timestamptz not null default now(),
  constraint categories_id_owner_unique unique (id, owner_id)
);

create unique index if not exists budget_app_categories_owner_kind_name_unique
  on public.budget_app_categories (owner_id, kind, lower(name));

create table if not exists public.budget_app_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind public.budget_app_transaction_kind not null,
  account_id uuid not null,
  destination_account_id uuid,
  amount numeric(18, 2) not null check (amount > 0),
  destination_amount numeric(18, 2),
  exchange_rate numeric(20, 10),
  fee_amount numeric(18, 2) not null default 0 check (fee_amount >= 0),
  category_id uuid,
  description text not null default '' check (char_length(description) <= 240),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint transactions_id_owner_unique unique (id, owner_id),
  constraint transactions_account_owner_fkey
    foreign key (account_id, owner_id)
    references public.budget_app_wallet_accounts (id, owner_id) on delete restrict,
  constraint transactions_destination_owner_fkey
    foreign key (destination_account_id, owner_id)
    references public.budget_app_wallet_accounts (id, owner_id) on delete restrict,
  constraint transactions_category_owner_fkey
    foreign key (category_id, owner_id)
    references public.budget_app_categories (id, owner_id) on delete restrict,
  constraint transactions_transfer_shape_check check (
    (kind = 'transfer'
      and destination_account_id is not null
      and destination_amount is not null
      and destination_amount > 0
      and account_id <> destination_account_id)
    or
    (kind in ('income', 'expense')
      and destination_account_id is null
      and destination_amount is null
      and exchange_rate is null
      and fee_amount = 0)
  ),
  constraint transactions_exchange_rate_check check (
    exchange_rate is null or exchange_rate > 0
  )
);

create index if not exists budget_app_transactions_owner_occurred_idx
  on public.budget_app_transactions (owner_id, occurred_at desc);
create index if not exists budget_app_transactions_account_occurred_idx
  on public.budget_app_transactions (account_id, occurred_at desc);
create index if not exists budget_app_transactions_destination_occurred_idx
  on public.budget_app_transactions (destination_account_id, occurred_at desc)
  where destination_account_id is not null;
create index if not exists budget_app_transactions_category_occurred_idx
  on public.budget_app_transactions (category_id, occurred_at desc)
  where category_id is not null;

create table if not exists public.budget_app_budget_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wallet_group_id uuid not null,
  currency text not null check (currency in ('USD', 'ZIG')),
  goal_kind public.budget_app_budget_goal_kind not null,
  category_id uuid,
  amount numeric(18, 2) not null check (amount > 0),
  period_start date not null,
  period_type text not null default 'month' check (period_type in ('week', 'month', 'quarter', 'year')),
  created_at timestamptz not null default now(),
  constraint budget_targets_id_owner_unique unique (id, owner_id),
  constraint budget_targets_group_owner_fkey
    foreign key (wallet_group_id, owner_id)
    references public.budget_app_wallet_groups (id, owner_id) on delete cascade,
  constraint budget_targets_category_owner_fkey
    foreign key (category_id, owner_id)
    references public.budget_app_categories (id, owner_id) on delete restrict
);

create unique index if not exists budget_app_budget_targets_wallet_unique
  on public.budget_app_budget_targets (owner_id, wallet_group_id, currency, goal_kind, period_type, period_start)
  where category_id is null;
create unique index if not exists budget_app_budget_targets_category_unique
  on public.budget_app_budget_targets (owner_id, wallet_group_id, currency, goal_kind, category_id, period_type, period_start)
  where category_id is not null;
create index if not exists budget_app_budget_targets_owner_period_idx
  on public.budget_app_budget_targets (owner_id, period_start desc);

-- Keep the payment-method subdivision specific to Personal and the project subdivision currency-only.
create or replace function public.budget_app_validate_wallet_account_structure()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  group_kind public.budget_app_wallet_group_kind;
begin
  select kind into group_kind
  from public.budget_app_wallet_groups
  where id = new.wallet_group_id and owner_id = new.owner_id;

  if group_kind is null then
    raise exception 'Wallet group does not exist for this owner';
  end if;

  if group_kind = 'personal' and new.channel is null then
    raise exception 'Personal accounts require EcoCash, Bank, or Cash as a sub-wallet';
  end if;
  if group_kind = 'project' and new.channel is not null then
    raise exception 'Project accounts are subdivided by currency only';
  end if;

  return new;
end;
$$;

drop trigger if exists wallet_accounts_structure on public.budget_app_wallet_accounts;
create trigger wallet_accounts_structure
before insert or update of wallet_group_id, owner_id, channel
on public.budget_app_wallet_accounts
for each row execute function public.budget_app_validate_wallet_account_structure();

-- Validate category type and currency conversion fields before accepting a ledger entry.
create or replace function public.budget_app_validate_transaction()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  source_currency text;
  destination_currency text;
  linked_category_kind public.budget_app_category_kind;
begin
  select currency into source_currency
  from public.budget_app_wallet_accounts where id = new.account_id and owner_id = new.owner_id;

  if new.kind = 'transfer' then
    select currency into destination_currency
    from public.budget_app_wallet_accounts
    where id = new.destination_account_id and owner_id = new.owner_id;

    if source_currency = destination_currency then
      if new.destination_amount <> new.amount or new.exchange_rate is not null then
        raise exception 'Same-currency transfers must preserve the amount and omit an exchange rate';
      end if;
    elsif new.exchange_rate is null then
      raise exception 'Cross-currency transfers require an exchange rate';
    end if;

    if new.fee_amount > 0 and new.category_id is null then
      raise exception 'Choose an expense category for a transfer fee';
    end if;
  elsif new.category_id is not null then
    select kind into linked_category_kind
    from public.budget_app_categories
    where id = new.category_id and owner_id = new.owner_id;

    if linked_category_kind is distinct from new.kind::text::public.budget_app_category_kind then
      raise exception 'Transaction and category types must match';
    end if;
  end if;

  if new.kind = 'transfer' and new.category_id is not null then
    select kind into linked_category_kind
    from public.budget_app_categories
    where id = new.category_id and owner_id = new.owner_id;
    if linked_category_kind <> 'expense' then
      raise exception 'Transfer fees must use an expense category';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_validate on public.budget_app_transactions;
create trigger transactions_validate
before insert or update of kind, account_id, destination_account_id, amount,
  destination_amount, exchange_rate, fee_amount, category_id, owner_id
on public.budget_app_transactions
for each row execute function public.budget_app_validate_transaction();

-- One call creates a project and both of its currency accounts atomically.
create or replace function public.budget_app_create_project_wallet(project_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  new_group_id uuid;
begin
  if current_owner is null then
    raise exception 'Sign in before creating a project wallet';
  end if;
  if char_length(trim(project_name)) not between 1 and 80 then
    raise exception 'Project name must be between 1 and 80 characters';
  end if;

  insert into public.budget_app_wallet_groups (owner_id, name, kind)
  values (current_owner, trim(project_name), 'project')
  returning id into new_group_id;

  insert into public.budget_app_wallet_accounts (owner_id, wallet_group_id, currency, channel)
  values
    (current_owner, new_group_id, 'USD', null),
    (current_owner, new_group_id, 'ZIG', null);

  return new_group_id;
end;
$$;
revoke all on function public.budget_app_create_project_wallet(text) from public;
grant execute on function public.budget_app_create_project_wallet(text) to authenticated;

-- New users receive the complete Personal account structure and a fee category.
create or replace function public.budget_app_create_initial_budget_data()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  personal_group_id uuid;
begin
  insert into public.budget_app_wallet_groups (owner_id, name, kind)
  values (new.id, 'Personal', 'personal')
  returning id into personal_group_id;

  insert into public.budget_app_wallet_accounts (owner_id, wallet_group_id, currency, channel)
  values
    (new.id, personal_group_id, 'USD', 'ecocash'),
    (new.id, personal_group_id, 'USD', 'bank'),
    (new.id, personal_group_id, 'USD', 'cash'),
    (new.id, personal_group_id, 'ZIG', 'ecocash'),
    (new.id, personal_group_id, 'ZIG', 'bank'),
    (new.id, personal_group_id, 'ZIG', 'cash');

  insert into public.budget_app_categories (owner_id, name, kind)
  values (new.id, 'Transfer fees', 'expense');

  return new;
end;
$$;
revoke all on function public.budget_app_create_initial_budget_data() from public;

drop trigger if exists budget_app_on_auth_user_created on auth.users;
create trigger budget_app_on_auth_user_created
after insert on auth.users
for each row execute function public.budget_app_create_initial_budget_data();

-- Row Level Security: every record belongs to exactly one authenticated user.
alter table public.budget_app_wallet_groups enable row level security;
alter table public.budget_app_wallet_accounts enable row level security;
alter table public.budget_app_categories enable row level security;
alter table public.budget_app_transactions enable row level security;
alter table public.budget_app_budget_targets enable row level security;

-- Remove both the original broad policy names and the split names so this file can be rerun.
drop policy if exists wallet_groups_owner_access on public.budget_app_wallet_groups;
drop policy if exists wallet_groups_select_own on public.budget_app_wallet_groups;
drop policy if exists wallet_groups_insert_own on public.budget_app_wallet_groups;
drop policy if exists wallet_groups_update_own on public.budget_app_wallet_groups;
create policy wallet_groups_select_own on public.budget_app_wallet_groups
for select to authenticated using (owner_id = (select auth.uid()));
create policy wallet_groups_insert_own on public.budget_app_wallet_groups
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy wallet_groups_update_own on public.budget_app_wallet_groups
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
revoke insert on public.budget_app_wallet_groups from authenticated;
grant select, update on public.budget_app_wallet_groups to authenticated;

drop policy if exists wallet_accounts_owner_access on public.budget_app_wallet_accounts;
drop policy if exists wallet_accounts_select_own on public.budget_app_wallet_accounts;
drop policy if exists wallet_accounts_insert_own on public.budget_app_wallet_accounts;
drop policy if exists wallet_accounts_update_own on public.budget_app_wallet_accounts;
create policy wallet_accounts_select_own on public.budget_app_wallet_accounts
for select to authenticated using (owner_id = (select auth.uid()));
create policy wallet_accounts_insert_own on public.budget_app_wallet_accounts
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy wallet_accounts_update_own on public.budget_app_wallet_accounts
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
grant select, insert, update on public.budget_app_wallet_accounts to authenticated;

drop policy if exists categories_owner_access on public.budget_app_categories;
drop policy if exists categories_select_own on public.budget_app_categories;
drop policy if exists categories_insert_own on public.budget_app_categories;
drop policy if exists categories_update_own on public.budget_app_categories;
drop policy if exists categories_delete_own on public.budget_app_categories;
create policy categories_select_own on public.budget_app_categories
for select to authenticated using (owner_id = (select auth.uid()));
create policy categories_insert_own on public.budget_app_categories
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy categories_update_own on public.budget_app_categories
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy categories_delete_own on public.budget_app_categories
for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.budget_app_categories to authenticated;

drop policy if exists transactions_owner_access on public.budget_app_transactions;
drop policy if exists transactions_select_own on public.budget_app_transactions;
drop policy if exists transactions_insert_own on public.budget_app_transactions;
drop policy if exists transactions_update_own on public.budget_app_transactions;
drop policy if exists transactions_delete_own on public.budget_app_transactions;
create policy transactions_select_own on public.budget_app_transactions
for select to authenticated using (owner_id = (select auth.uid()));
create policy transactions_insert_own on public.budget_app_transactions
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy transactions_update_own on public.budget_app_transactions
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy transactions_delete_own on public.budget_app_transactions
for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.budget_app_transactions to authenticated;

drop policy if exists budget_targets_owner_access on public.budget_app_budget_targets;
drop policy if exists budget_targets_select_own on public.budget_app_budget_targets;
drop policy if exists budget_targets_insert_own on public.budget_app_budget_targets;
drop policy if exists budget_targets_update_own on public.budget_app_budget_targets;
drop policy if exists budget_targets_delete_own on public.budget_app_budget_targets;
create policy budget_targets_select_own on public.budget_app_budget_targets
for select to authenticated using (owner_id = (select auth.uid()));
create policy budget_targets_insert_own on public.budget_app_budget_targets
for insert to authenticated with check (owner_id = (select auth.uid()));
create policy budget_targets_update_own on public.budget_app_budget_targets
for update to authenticated using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy budget_targets_delete_own on public.budget_app_budget_targets
for delete to authenticated using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.budget_app_budget_targets to authenticated;
-- Wallets are archived, not deleted, so the Personal structure and history remain intact.
create or replace function public.budget_app_prevent_wallet_group_kind_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.kind is distinct from old.kind then
    raise exception 'Wallet group type cannot be changed';
  end if;
  if old.kind = 'personal' and lower(new.name) <> 'personal' then
    raise exception 'The Personal wallet keeps its canonical name';
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_groups_kind_immutable on public.budget_app_wallet_groups;
create trigger wallet_groups_kind_immutable
before update of kind, name on public.budget_app_wallet_groups
for each row execute function public.budget_app_prevent_wallet_group_kind_change();

create or replace function public.budget_app_validate_budget_category()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  linked_category_kind public.budget_app_category_kind;
  expected_category_kind public.budget_app_category_kind;
begin
  if new.category_id is null then
    return new;
  end if;

  if new.goal_kind = 'savings_target' then
    raise exception 'Savings targets are tracked for a wallet and currency, not a category';
  end if;

  select kind into linked_category_kind
  from public.budget_app_categories
  where id = new.category_id and owner_id = new.owner_id;

  expected_category_kind := case new.goal_kind
    when 'spending_cap' then 'expense'::public.budget_app_category_kind
    else 'income'::public.budget_app_category_kind
  end;

  if linked_category_kind is distinct from expected_category_kind then
    raise exception 'Budget goal and category types must match';
  end if;

  return new;
end;
$$;

drop trigger if exists budget_targets_validate_category on public.budget_app_budget_targets;
create trigger budget_targets_validate_category
before insert or update of category_id, goal_kind, owner_id
on public.budget_app_budget_targets
for each row execute function public.budget_app_validate_budget_category();

grant usage on schema public to authenticated;

alter table public.budget_app_wallet_groups
  add column if not exists archived_at timestamptz;
create index if not exists budget_app_wallet_groups_owner_active_idx
  on public.budget_app_wallet_groups (owner_id, created_at)
  where archived_at is null;

-- Compute balances from the ledger in one database call; unlike currencies stay separate.
create or replace function public.budget_app_get_account_balances()
returns table (account_id uuid, balance numeric(18, 2))
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    a.id as account_id,
    (a.opening_balance + coalesce(sum(
      case
        when t.kind = 'income' and t.account_id = a.id then t.amount
        when t.kind = 'expense' and t.account_id = a.id then -t.amount
        when t.kind = 'transfer' and t.account_id = a.id then -(t.amount + t.fee_amount)
        when t.kind = 'transfer' and t.destination_account_id = a.id then t.destination_amount
        else 0
      end
    ), 0))::numeric(18, 2) as balance
  from public.budget_app_wallet_accounts as a
  left join public.budget_app_transactions as t
    on t.owner_id = a.owner_id
    and (t.account_id = a.id or t.destination_account_id = a.id)
  where a.owner_id = (select auth.uid())
  group by a.id, a.opening_balance;
$$;
grant execute on function public.budget_app_get_account_balances() to authenticated;

-- Backfill existing users if the migration is applied after the first account is created.
insert into public.budget_app_wallet_groups (owner_id, name, kind)
select u.id, 'Personal', 'personal'
from auth.users as u
where not exists (
  select 1 from public.budget_app_wallet_groups as g
  where g.owner_id = u.id and g.kind = 'personal'
);

insert into public.budget_app_wallet_accounts (owner_id, wallet_group_id, currency, channel)
select g.owner_id, g.id, seed.currency, seed.channel::public.budget_app_wallet_channel
from public.budget_app_wallet_groups as g
cross join (values
  ('USD', 'ecocash'), ('USD', 'bank'), ('USD', 'cash'),
  ('ZIG', 'ecocash'), ('ZIG', 'bank'), ('ZIG', 'cash')
) as seed(currency, channel)
where g.kind = 'personal'
  and not exists (
    select 1 from public.budget_app_wallet_accounts as a
    where a.wallet_group_id = g.id
      and a.currency = seed.currency
      and a.channel = seed.channel::public.budget_app_wallet_channel
  );

insert into public.budget_app_categories (owner_id, name, kind)
select u.id, 'Transfer fees', 'expense'
from auth.users as u
where not exists (
  select 1 from public.budget_app_categories as c
  where c.owner_id = u.id and c.kind = 'expense' and lower(c.name) = 'transfer fees'
);

-- Project wallets can track USD, ZiG, or both. This overload preserves compatibility
-- with the original one-argument RPC while the app uses currency selection.
create or replace function public.budget_app_create_project_wallet(project_name text, currencies text[])
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
  new_group_id uuid;
begin
  if current_owner is null then raise exception 'Sign in before creating a project wallet'; end if;
  if char_length(trim(project_name)) not between 1 and 80 then raise exception 'Wallet name must be between 1 and 80 characters'; end if;
  if currencies is null or cardinality(currencies) = 0
    or exists (select 1 from unnest(currencies) as c where c not in ('USD', 'ZIG')) then
    raise exception 'Choose USD, ZiG, or both currencies';
  end if;
  insert into public.budget_app_wallet_groups (owner_id, name, kind)
  values (current_owner, trim(project_name), 'project') returning id into new_group_id;
  insert into public.budget_app_wallet_accounts (owner_id, wallet_group_id, currency, channel)
  select current_owner, new_group_id, c, null from (select distinct unnest(currencies) as c) selected;
  return new_group_id;
end;
$$;
revoke all on function public.budget_app_create_project_wallet(text, text[]) from public;
grant execute on function public.budget_app_create_project_wallet(text, text[]) to authenticated;

create or replace function public.budget_app_update_project_wallet(wallet_id uuid, project_name text, currencies text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_owner uuid := auth.uid();
begin
  if current_owner is null then raise exception 'Sign in before editing a project wallet'; end if;
  if char_length(trim(project_name)) not between 1 and 80 then raise exception 'Wallet name must be between 1 and 80 characters'; end if;
  if currencies is null or cardinality(currencies) = 0
    or exists (select 1 from unnest(currencies) as c where c not in ('USD', 'ZIG')) then
    raise exception 'Choose USD, ZiG, or both currencies';
  end if;
  update public.budget_app_wallet_groups set name = trim(project_name)
  where id = wallet_id and owner_id = current_owner and kind = 'project';
  if not found then raise exception 'Project wallet was not found'; end if;
  update public.budget_app_wallet_accounts
  set archived_at = coalesce(archived_at, now())
  where wallet_group_id = wallet_id and owner_id = current_owner
    and channel is null and not (currency = any(currencies));
  insert into public.budget_app_wallet_accounts (owner_id, wallet_group_id, currency, channel)
  select current_owner, wallet_id, c, null from (select distinct unnest(currencies) as c) selected
  on conflict (wallet_group_id, currency) where channel is null do update set archived_at = null;
end;
$$;
revoke all on function public.budget_app_update_project_wallet(uuid, text, text[]) from public;
grant execute on function public.budget_app_update_project_wallet(uuid, text, text[]) to authenticated;
