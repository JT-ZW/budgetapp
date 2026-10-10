-- Existing stock holdings can be imported without affecting wallet balances.
-- New purchases are funded atomically from a personal wallet, including charges.

create or replace function public.budget_app_import_stock_holding(
  p_investment_account_id uuid,
  p_ticker text,
  p_company_name text,
  p_quantity numeric,
  p_buy_price numeric,
  p_fees numeric,
  p_occurred_at timestamptz default now()
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_owner uuid := auth.uid();
  new_counter_id uuid;
  new_trade_id uuid;
begin
  if current_owner is null then raise exception 'Sign in before importing a holding'; end if;
  if p_ticker is null or p_ticker !~ '^[A-Za-z0-9.-]{1,20}$' or char_length(trim(coalesce(p_company_name,''))) not between 1 and 100 then
    raise exception 'Enter a valid counter and company name';
  end if;
  if p_quantity <= 0 or p_buy_price <= 0 or p_fees < 0 then raise exception 'Enter valid share, price, and charge amounts'; end if;
  perform 1 from public.budget_app_investment_accounts
    where id=p_investment_account_id and owner_id=current_owner and kind='stocks' for update;
  if not found then raise exception 'Choose a stocks account'; end if;

  insert into public.budget_app_investment_counters(owner_id,investment_account_id,ticker,company_name)
    values(current_owner,p_investment_account_id,upper(trim(p_ticker)),trim(p_company_name))
    on conflict (investment_account_id, (upper(ticker))) do nothing;
  select id into new_counter_id from public.budget_app_investment_counters
    where owner_id=current_owner and investment_account_id=p_investment_account_id and upper(ticker)=upper(trim(p_ticker));

  insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
    values(current_owner,p_investment_account_id,new_counter_id,'opening',p_quantity,p_buy_price,p_fees,coalesce(p_occurred_at,now()),'Imported existing holding')
    returning id into new_trade_id;
  return new_trade_id;
end $$;
revoke execute on function public.budget_app_import_stock_holding(uuid,text,text,numeric,numeric,numeric,timestamptz) from public, anon;
grant execute on function public.budget_app_import_stock_holding(uuid,text,text,numeric,numeric,numeric,timestamptz) to authenticated;

create or replace function public.budget_app_buy_stock_from_wallet(
  p_investment_account_id uuid,
  p_wallet_account_id uuid,
  p_ticker text,
  p_company_name text,
  p_quantity numeric,
  p_unit_price numeric,
  p_fees numeric,
  p_occurred_at timestamptz default now(),
  p_description text default ''
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_owner uuid := auth.uid();
  account_currency text;
  wallet_currency text;
  wallet_balance numeric;
  total_cost numeric;
  counter_uuid uuid;
  trade_uuid uuid;
begin
  if current_owner is null then raise exception 'Sign in before recording a stock purchase'; end if;
  if p_ticker is null or p_ticker !~ '^[A-Za-z0-9.-]{1,20}$' or char_length(trim(coalesce(p_company_name,''))) not between 1 and 100 then
    raise exception 'Enter a valid counter and company name';
  end if;
  if p_quantity <= 0 or p_unit_price <= 0 or p_fees < 0 then raise exception 'Enter valid share, price, and charge amounts'; end if;

  select currency into account_currency from public.budget_app_investment_accounts
    where id=p_investment_account_id and owner_id=current_owner and kind='stocks' for update;
  if account_currency is null then raise exception 'Choose a stocks account'; end if;
  select currency into wallet_currency from public.budget_app_wallet_accounts
    where id=p_wallet_account_id and owner_id=current_owner and archived_at is null for update;
  if wallet_currency is null or wallet_currency <> account_currency then
    raise exception 'Choose an active personal wallet in the same currency as the stocks account';
  end if;

  total_cost := round(p_quantity*p_unit_price,2) + p_fees;
  select balance into wallet_balance from public.budget_app_get_account_balances() where account_id=p_wallet_account_id;
  if coalesce(wallet_balance,0) < total_cost then raise exception 'The selected wallet does not have enough available balance for the shares and charges'; end if;

  insert into public.budget_app_investment_counters(owner_id,investment_account_id,ticker,company_name)
    values(current_owner,p_investment_account_id,upper(trim(p_ticker)),trim(p_company_name))
    on conflict (investment_account_id, (upper(ticker))) do nothing;
  select id into counter_uuid from public.budget_app_investment_counters
    where owner_id=current_owner and investment_account_id=p_investment_account_id and upper(ticker)=upper(trim(p_ticker));

  insert into public.budget_app_investment_cash_movements(owner_id,investment_account_id,wallet_account_id,kind,amount,description,occurred_at)
    values(current_owner,p_investment_account_id,p_wallet_account_id,'deposit',total_cost,'Stock purchase funding',coalesce(p_occurred_at,now()));
  insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
    values(current_owner,p_investment_account_id,counter_uuid,'buy',p_quantity,p_unit_price,p_fees,coalesce(p_occurred_at,now()),left(coalesce(p_description,''),240))
    returning id into trade_uuid;
  return trade_uuid;
end $$;
revoke execute on function public.budget_app_buy_stock_from_wallet(uuid,uuid,text,text,numeric,numeric,numeric,timestamptz,text) from public, anon;
grant execute on function public.budget_app_buy_stock_from_wallet(uuid,uuid,text,text,numeric,numeric,numeric,timestamptz,text) to authenticated;
