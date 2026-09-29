-- Add week, month, quarter, and year targets plus transfer-based savings goals.
-- Run in Supabase SQL Editor after SETUP_BUDGET_APP.sql.
-- Existing monthly targets remain monthly and keep their saved period_start.

alter type public.budget_app_budget_goal_kind add value if not exists 'savings_target';

alter table public.budget_app_budget_targets
  drop constraint if exists budget_app_budget_targets_period_start_check;
alter table public.budget_app_budget_targets
  add column if not exists period_type text not null default 'month'
  check (period_type in ('week', 'month', 'quarter', 'year'));

drop index if exists public.budget_app_budget_targets_wallet_unique;
drop index if exists public.budget_app_budget_targets_category_unique;
create unique index budget_app_budget_targets_wallet_unique
  on public.budget_app_budget_targets (owner_id, wallet_group_id, currency, goal_kind, period_type, period_start)
  where category_id is null;
create unique index budget_app_budget_targets_category_unique
  on public.budget_app_budget_targets (owner_id, wallet_group_id, currency, goal_kind, category_id, period_type, period_start)
  where category_id is not null;

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
