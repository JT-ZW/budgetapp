-- Custom end dates are inclusive. Standard calendar targets keep period_end null.
alter table public.budget_app_budget_targets
  drop constraint budget_app_budget_targets_period_type_check;
alter table public.budget_app_budget_targets
  add column period_end date,
  add constraint budget_app_budget_targets_period_type_check
    check(period_type in ('week','month','quarter','year','custom')),
  add constraint budget_app_budget_targets_custom_dates_check check (
    (period_type='custom' and period_end is not null and period_end>=period_start
      and isfinite(period_start) and isfinite(period_end))
    or (period_type<>'custom' and period_end is null)
  );
drop index public.budget_app_budget_targets_wallet_unique;
drop index public.budget_app_budget_targets_category_unique;
create unique index budget_app_budget_targets_wallet_unique
  on public.budget_app_budget_targets(owner_id,wallet_group_id,currency,goal_kind,period_type,period_start,(coalesce(period_end,'infinity'::date))) where category_id is null;
create unique index budget_app_budget_targets_category_unique
  on public.budget_app_budget_targets(owner_id,wallet_group_id,currency,goal_kind,category_id,period_type,period_start,(coalesce(period_end,'infinity'::date))) where category_id is not null;
