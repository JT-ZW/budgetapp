-- Allow stock buys to spend cash already transferred into the brokerage account.
create or replace function public.budget_app_buy_stock_from_brokerage(
  p_investment_account_id uuid,
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
  account_kind text;
  counter_uuid uuid;
  trade_uuid uuid;
begin
  if current_owner is null then raise exception 'Sign in before recording a stock purchase'; end if;
  if p_ticker is null or p_ticker !~ '^[A-Za-z0-9.-]{1,20}$' or char_length(trim(coalesce(p_company_name,''))) not between 1 and 100 then
    raise exception 'Enter a valid counter and company name';
  end if;
  if p_quantity <= 0 or p_unit_price <= 0 or p_fees < 0 then raise exception 'Enter valid share, price, and charge amounts'; end if;

  select kind into account_kind from public.budget_app_investment_accounts
    where id=p_investment_account_id and owner_id=current_owner for update;
  if account_kind is distinct from 'stocks' then raise exception 'Choose a stocks account'; end if;

  insert into public.budget_app_investment_counters(owner_id,investment_account_id,ticker,company_name)
    values(current_owner,p_investment_account_id,upper(trim(p_ticker)),trim(p_company_name))
    on conflict (investment_account_id, (upper(ticker))) do nothing;
  select id into counter_uuid from public.budget_app_investment_counters
    where owner_id=current_owner and investment_account_id=p_investment_account_id and upper(ticker)=upper(trim(p_ticker));

  trade_uuid := public.budget_app_record_stock_trade(
    counter_uuid,'buy',p_quantity,p_unit_price,p_fees,coalesce(p_occurred_at,now()),p_description
  );
  return trade_uuid;
end $$;
revoke execute on function public.budget_app_buy_stock_from_brokerage(uuid,text,text,numeric,numeric,numeric,timestamptz,text) from public, anon;
grant execute on function public.budget_app_buy_stock_from_brokerage(uuid,text,text,numeric,numeric,numeric,timestamptz,text) to authenticated;
