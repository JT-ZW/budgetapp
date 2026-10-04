-- Existing investment accounts and holdings can be entered as opening records without
-- moving money out of personal wallets. Later deposits and withdrawals remain transfers.
alter table public.budget_app_investment_accounts
  add column if not exists opening_capital numeric(18,2) not null default 0 check (opening_capital >= 0);

alter table public.budget_app_investment_trades drop constraint if exists budget_app_investment_trades_kind_check;
alter table public.budget_app_investment_trades
  add constraint budget_app_investment_trades_kind_check check (kind in ('buy','sell','opening'));

create or replace function public.budget_app_create_investment_account(
  account_name text, account_kind text, account_currency text, funding_wallet_id uuid, initial_capital numeric
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_owner uuid := auth.uid(); new_id uuid;
begin
  if current_owner is null then raise exception 'Sign in before creating an investment account'; end if;
  if char_length(trim(account_name)) not between 1 and 80 then raise exception 'Enter an account name'; end if;
  if account_kind not in ('stocks','forex') or account_currency not in ('USD','ZIG') then raise exception 'Choose a valid investment type and currency'; end if;
  if initial_capital < 0 then raise exception 'Starting amount cannot be negative'; end if;
  insert into public.budget_app_investment_accounts(owner_id,name,kind,currency,opening_capital)
  values(current_owner,trim(account_name),account_kind,account_currency,initial_capital) returning id into new_id;
  return new_id;
end $$;
revoke execute on function public.budget_app_create_investment_account(text,text,text,uuid,numeric) from public, anon;
grant execute on function public.budget_app_create_investment_account(text,text,text,uuid,numeric) to authenticated;

create or replace function public.budget_app_set_investment_opening_capital(p_account_id uuid, p_amount numeric)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in before updating an investment account'; end if;
  if p_amount < 0 then raise exception 'Starting amount cannot be negative'; end if;
  update public.budget_app_investment_accounts set opening_capital=p_amount
  where id=p_account_id and owner_id=auth.uid();
  if not found then raise exception 'Investment account not found'; end if;
end $$;
revoke execute on function public.budget_app_set_investment_opening_capital(uuid,numeric) from public, anon;
grant execute on function public.budget_app_set_investment_opening_capital(uuid,numeric) to authenticated;

-- Add an existing position as a non-cash opening lot and set its current reference price.
create or replace function public.budget_app_add_opening_position(
  p_counter_id uuid, p_quantity numeric, p_buy_price numeric, p_fees numeric,
  p_current_price numeric, p_acquired_at timestamptz, p_price_date date
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare current_owner uuid := auth.uid(); acct_id uuid; new_trade uuid;
begin
  if current_owner is null then raise exception 'Sign in before recording an opening holding'; end if;
  select c.investment_account_id into acct_id from public.budget_app_investment_counters c
  join public.budget_app_investment_accounts a on a.id=c.investment_account_id and a.owner_id=c.owner_id
  where c.id=p_counter_id and c.owner_id=current_owner and a.kind='stocks';
  if acct_id is null then raise exception 'Choose a counter in a stocks account'; end if;
  if p_quantity <= 0 or p_buy_price <= 0 or p_current_price <= 0 or p_fees < 0 then raise exception 'Enter valid opening holding details'; end if;
  insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
  values(current_owner,acct_id,p_counter_id,'opening',p_quantity,p_buy_price,p_fees,coalesce(p_acquired_at,now()),'Opening position') returning id into new_trade;
  insert into public.budget_app_investment_prices(owner_id,counter_id,price_date,closing_price)
  values(current_owner,p_counter_id,p_price_date,p_current_price)
  on conflict(counter_id,price_date) do update set closing_price=excluded.closing_price;
  return new_trade;
end $$;
revoke execute on function public.budget_app_add_opening_position(uuid,numeric,numeric,numeric,numeric,timestamptz,date) from public, anon;
grant execute on function public.budget_app_add_opening_position(uuid,numeric,numeric,numeric,numeric,timestamptz,date) to authenticated;

-- Recalculate available shares from both imported opening lots and later purchases.
create or replace function public.budget_app_record_stock_trade(
  p_counter_id uuid, p_kind text, p_quantity numeric, p_unit_price numeric, p_fees numeric, p_occurred_at timestamptz, p_description text default ''
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare current_owner uuid := auth.uid(); acct_id uuid; available numeric; cash_available numeric; remaining numeric := p_quantity; matched_cost numeric := 0; lot record; take_qty numeric; new_trade uuid; net numeric;
begin
  select investment_account_id into acct_id from public.budget_app_investment_counters where id=p_counter_id and owner_id=current_owner;
  if current_owner is null or acct_id is null then raise exception 'Choose a counter in your account'; end if;
  if p_kind not in ('buy','sell') or p_quantity <= 0 or p_unit_price <= 0 or p_fees < 0 then raise exception 'Enter valid trade details'; end if;
  if p_kind='buy' then
    select coalesce(sum(case when kind='deposit' then amount else -amount end),0) into cash_available from public.budget_app_investment_cash_movements where investment_account_id=acct_id and owner_id=current_owner;
    select cash_available + coalesce(sum(case when kind='buy' then -(round(quantity*unit_price,2)+fees) when kind='sell' then round(quantity*unit_price,2)-fees else 0 end),0)
      into cash_available from public.budget_app_investment_trades where investment_account_id=acct_id and owner_id=current_owner;
    select cash_available + opening_capital into cash_available from public.budget_app_investment_accounts where id=acct_id and owner_id=current_owner;
    if round(p_quantity*p_unit_price,2)+p_fees > cash_available then raise exception 'This buy exceeds the available brokerage cash'; end if;
  else
    select coalesce(sum(t.quantity),0)-coalesce((select sum(m.quantity) from public.budget_app_investment_lot_matches m join public.budget_app_investment_trades s on s.id=m.sell_trade_id where s.counter_id=p_counter_id and s.owner_id=current_owner),0)
      into available from public.budget_app_investment_trades t where t.counter_id=p_counter_id and t.owner_id=current_owner and t.kind in ('buy','opening');
    if p_quantity > available then raise exception 'You cannot sell more shares than you currently hold'; end if;
    insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
    values(current_owner,acct_id,p_counter_id,'sell',p_quantity,p_unit_price,p_fees,p_occurred_at,left(coalesce(p_description,''),240)) returning id into new_trade;
    for lot in select id,quantity,unit_price,fees from public.budget_app_investment_trades where counter_id=p_counter_id and owner_id=current_owner and kind in ('buy','opening') order by occurred_at,created_at,id loop
      exit when remaining <= 0;
      select coalesce(sum(quantity),0) into available from public.budget_app_investment_lot_matches where buy_trade_id=lot.id;
      take_qty := least(remaining,greatest(lot.quantity-available,0));
      if take_qty > 0 then
        matched_cost := matched_cost + round(take_qty*(lot.unit_price+(lot.fees/lot.quantity)),2);
        remaining := remaining-take_qty;
        insert into public.budget_app_investment_lot_matches(owner_id,buy_trade_id,sell_trade_id,quantity) values(current_owner,lot.id,new_trade,take_qty);
      end if;
    end loop;
    net := round(p_quantity*p_unit_price,2)-p_fees;
    update public.budget_app_investment_trades set realized_cost_basis=matched_cost,realized_profit=net-matched_cost where id=new_trade;
  end if;
  if p_kind='buy' then
    insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
    values(current_owner,acct_id,p_counter_id,'buy',p_quantity,p_unit_price,p_fees,p_occurred_at,left(coalesce(p_description,''),240)) returning id into new_trade;
  end if;
  return new_trade;
end $$;
revoke execute on function public.budget_app_record_stock_trade(uuid,text,numeric,numeric,numeric,timestamptz,text) from public, anon;
grant execute on function public.budget_app_record_stock_trade(uuid,text,numeric,numeric,numeric,timestamptz,text) to authenticated;
