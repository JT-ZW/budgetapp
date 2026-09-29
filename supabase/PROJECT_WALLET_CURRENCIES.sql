-- Project wallets may track USD, ZiG, or both.
-- Run this migration in Supabase SQL Editor after SETUP_BUDGET_APP.sql.
-- Removed currency accounts are archived so their history remains available.

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
  if current_owner is null then
    raise exception 'Sign in before creating a project wallet';
  end if;
  if char_length(trim(project_name)) not between 1 and 80 then
    raise exception 'Wallet name must be between 1 and 80 characters';
  end if;
  if currencies is null or cardinality(currencies) = 0
    or exists (select 1 from unnest(currencies) as c where c not in ('USD', 'ZIG')) then
    raise exception 'Choose USD, ZiG, or both currencies';
  end if;

  insert into public.budget_app_wallet_groups (owner_id, name, kind)
  values (current_owner, trim(project_name), 'project')
  returning id into new_group_id;

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
  if current_owner is null then
    raise exception 'Sign in before editing a project wallet';
  end if;
  if char_length(trim(project_name)) not between 1 and 80 then
    raise exception 'Wallet name must be between 1 and 80 characters';
  end if;
  if currencies is null or cardinality(currencies) = 0
    or exists (select 1 from unnest(currencies) as c where c not in ('USD', 'ZIG')) then
    raise exception 'Choose USD, ZiG, or both currencies';
  end if;

  update public.budget_app_wallet_groups
  set name = trim(project_name)
  where id = wallet_id and owner_id = current_owner and kind = 'project';
  if not found then
    raise exception 'Project wallet was not found';
  end if;

  update public.budget_app_wallet_accounts
  set archived_at = coalesce(archived_at, now())
  where wallet_group_id = wallet_id and owner_id = current_owner
    and channel is null and not (currency = any(currencies));

  insert into public.budget_app_wallet_accounts (owner_id, wallet_group_id, currency, channel)
  select current_owner, wallet_id, c, null from (select distinct unnest(currencies) as c) selected
  on conflict (wallet_group_id, currency) where channel is null
  do update set archived_at = null;
end;
$$;
revoke all on function public.budget_app_update_project_wallet(uuid, text, text[]) from public;
grant execute on function public.budget_app_update_project_wallet(uuid, text, text[]) to authenticated;
