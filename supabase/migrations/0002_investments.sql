-- Manual investment tracking for stocks and forex. All money values use exact decimals.
create table if not exists public.budget_app_investment_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  kind text not null check (kind in ('stocks', 'forex')),
  currency text not null check (currency in ('USD', 'ZIG')),
  created_at timestamptz not null default now(),
  constraint investment_accounts_id_owner_unique unique (id, owner_id)
);

create table if not exists public.budget_app_investment_cash_movements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null,
  wallet_account_id uuid not null,
  kind text not null check (kind in ('deposit', 'withdrawal')),
  amount numeric(18,2) not null check (amount > 0),
  description text not null default '' check (char_length(description) <= 240),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint investment_cash_movements_account_owner_fkey foreign key (investment_account_id, owner_id)
    references public.budget_app_investment_accounts(id, owner_id) on delete cascade,
  constraint investment_cash_movements_wallet_owner_fkey foreign key (wallet_account_id, owner_id)
    references public.budget_app_wallet_accounts(id, owner_id) on delete restrict
);

create table if not exists public.budget_app_investment_counters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null,
  ticker text not null check (char_length(trim(ticker)) between 1 and 20),
  company_name text not null check (char_length(trim(company_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  constraint investment_counters_id_owner_unique unique (id, owner_id),
  constraint investment_counters_account_owner_fkey foreign key (investment_account_id, owner_id)
    references public.budget_app_investment_accounts(id, owner_id) on delete cascade
);
create unique index if not exists budget_app_investment_counters_account_ticker_unique
  on public.budget_app_investment_counters(investment_account_id, upper(ticker));

create table if not exists public.budget_app_investment_trades (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null,
  counter_id uuid not null,
  kind text not null check (kind in ('buy', 'sell')),
  quantity numeric(20,6) not null check (quantity > 0),
  unit_price numeric(18,6) not null check (unit_price > 0),
  fees numeric(18,2) not null default 0 check (fees >= 0),
  occurred_at timestamptz not null default now(),
  description text not null default '' check (char_length(description) <= 240),
  realized_cost_basis numeric(18,2),
  realized_profit numeric(18,2),
  created_at timestamptz not null default now(),
  constraint investment_trades_account_owner_fkey foreign key (investment_account_id, owner_id)
    references public.budget_app_investment_accounts(id, owner_id) on delete cascade,
  constraint investment_trades_counter_owner_fkey foreign key (counter_id, owner_id)
    references public.budget_app_investment_counters(id, owner_id) on delete restrict
);

create table if not exists public.budget_app_investment_lot_matches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  buy_trade_id uuid not null references public.budget_app_investment_trades(id) on delete cascade,
  sell_trade_id uuid not null references public.budget_app_investment_trades(id) on delete cascade,
  quantity numeric(20,6) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.budget_app_investment_prices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  counter_id uuid not null,
  price_date date not null,
  closing_price numeric(18,6) not null check (closing_price > 0),
  created_at timestamptz not null default now(),
  constraint investment_prices_counter_owner_fkey foreign key (counter_id, owner_id)
    references public.budget_app_investment_counters(id, owner_id) on delete cascade,
  constraint investment_prices_counter_date_unique unique (counter_id, price_date)
);

create table if not exists public.budget_app_forex_valuations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  investment_account_id uuid not null,
  valuation_date date not null,
  closing_equity numeric(18,2) not null check (closing_equity >= 0),
  note text not null default '' check (char_length(note) <= 240),
  created_at timestamptz not null default now(),
  constraint forex_valuations_account_owner_fkey foreign key (investment_account_id, owner_id)
    references public.budget_app_investment_accounts(id, owner_id) on delete cascade,
  constraint forex_valuations_account_date_unique unique (investment_account_id, valuation_date)
);

create index if not exists investment_accounts_owner_idx on public.budget_app_investment_accounts(owner_id, created_at);
create index if not exists investment_movements_account_date_idx on public.budget_app_investment_cash_movements(investment_account_id, occurred_at desc);
create index if not exists investment_trades_counter_date_idx on public.budget_app_investment_trades(counter_id, occurred_at, created_at);
create index if not exists investment_prices_counter_date_idx on public.budget_app_investment_prices(counter_id, price_date desc);
create index if not exists forex_valuations_account_date_idx on public.budget_app_forex_valuations(investment_account_id, valuation_date desc);

create or replace function public.budget_app_validate_investment_cash_movement()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare investment_currency text; wallet_currency text; begin
  select currency into investment_currency from public.budget_app_investment_accounts where id=new.investment_account_id and owner_id=new.owner_id;
  select currency into wallet_currency from public.budget_app_wallet_accounts where id=new.wallet_account_id and owner_id=new.owner_id and archived_at is null;
  if investment_currency is null or wallet_currency is null or investment_currency <> wallet_currency then
    raise exception 'Investment transfers require an active same-currency personal wallet';
  end if;
  return new;
end $$;
drop trigger if exists investment_cash_movement_validate on public.budget_app_investment_cash_movements;
create trigger investment_cash_movement_validate before insert or update on public.budget_app_investment_cash_movements
for each row execute function public.budget_app_validate_investment_cash_movement();

create or replace function public.budget_app_validate_investment_instrument()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare account_kind text; begin
  select kind into account_kind from public.budget_app_investment_accounts where id=new.investment_account_id and owner_id=new.owner_id;
  if account_kind is distinct from 'stocks' then raise exception 'Stock counters belong to a stocks account'; end if;
  return new;
end $$;
drop trigger if exists investment_counter_account_validate on public.budget_app_investment_counters;
create trigger investment_counter_account_validate before insert or update on public.budget_app_investment_counters
for each row execute function public.budget_app_validate_investment_instrument();

create or replace function public.budget_app_validate_forex_valuation()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare account_kind text; begin
  select kind into account_kind from public.budget_app_investment_accounts where id=new.investment_account_id and owner_id=new.owner_id;
  if account_kind is distinct from 'forex' then raise exception 'Daily equity snapshots belong to a forex account'; end if;
  return new;
end $$;
drop trigger if exists forex_valuation_account_validate on public.budget_app_forex_valuations;
create trigger forex_valuation_account_validate before insert or update on public.budget_app_forex_valuations
for each row execute function public.budget_app_validate_forex_valuation();

alter table public.budget_app_investment_accounts enable row level security;
alter table public.budget_app_investment_cash_movements enable row level security;
alter table public.budget_app_investment_counters enable row level security;
alter table public.budget_app_investment_trades enable row level security;
alter table public.budget_app_investment_lot_matches enable row level security;
alter table public.budget_app_investment_prices enable row level security;
alter table public.budget_app_forex_valuations enable row level security;

do $$ declare t text; begin
  foreach t in array array['budget_app_investment_accounts','budget_app_investment_cash_movements','budget_app_investment_counters','budget_app_investment_trades','budget_app_investment_lot_matches','budget_app_investment_prices','budget_app_forex_valuations'] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner_access', t);
    execute format('create policy %I on public.%I for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t || '_owner_access', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Create account and its opening contribution in one transaction. An opening contribution
-- must be transferred from an existing same-currency wallet.
create or replace function public.budget_app_create_investment_account(
  account_name text, account_kind text, account_currency text, funding_wallet_id uuid, initial_capital numeric
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare current_owner uuid := auth.uid(); new_id uuid; wallet_currency text;
begin
  if current_owner is null then raise exception 'Sign in before creating an investment account'; end if;
  if char_length(trim(account_name)) not between 1 and 80 then raise exception 'Enter an account name'; end if;
  if account_kind not in ('stocks','forex') or account_currency not in ('USD','ZIG') then raise exception 'Choose a valid investment type and currency'; end if;
  if initial_capital < 0 then raise exception 'Starting capital cannot be negative'; end if;
  if initial_capital > 0 then
    select currency into wallet_currency from public.budget_app_wallet_accounts
    where id = funding_wallet_id and owner_id = current_owner and archived_at is null;
    if wallet_currency is null or wallet_currency <> account_currency then raise exception 'Choose an active wallet in the same currency'; end if;
  end if;
  insert into public.budget_app_investment_accounts(owner_id,name,kind,currency)
  values (current_owner,trim(account_name),account_kind,account_currency) returning id into new_id;
  if initial_capital > 0 then
    insert into public.budget_app_investment_cash_movements(owner_id,investment_account_id,wallet_account_id,kind,amount,description)
    values(current_owner,new_id,funding_wallet_id,'deposit',initial_capital,'Initial capital');
  end if;
  return new_id;
end $$;
grant execute on function public.budget_app_create_investment_account(text,text,text,uuid,numeric) to authenticated;
revoke execute on function public.budget_app_create_investment_account(text,text,text,uuid,numeric) from public, anon;

-- Investment funding is a balance transfer; it does not enter household income or spending.
create or replace function public.budget_app_get_account_balances()
returns table (account_id uuid, balance numeric(18, 2)) language sql stable security invoker set search_path = public, pg_temp as $$
  with ledger as (
    select a.id, coalesce(sum(case
      when t.kind = 'income' and t.account_id = a.id then t.amount
      when t.kind = 'expense' and t.account_id = a.id then -t.amount
      when t.kind = 'transfer' and t.account_id = a.id then -(t.amount + t.fee_amount)
      when t.kind = 'transfer' and t.destination_account_id = a.id then t.destination_amount
      else 0 end),0) as delta
    from public.budget_app_wallet_accounts a left join public.budget_app_transactions t
      on t.owner_id=a.owner_id and (t.account_id=a.id or t.destination_account_id=a.id)
    where a.owner_id=(select auth.uid()) group by a.id
  ), movements as (
    select wallet_account_id as id, sum(case when kind='deposit' then -amount else amount end) as delta
    from public.budget_app_investment_cash_movements where owner_id=(select auth.uid()) group by wallet_account_id
  )
  select a.id,(a.opening_balance+coalesce(l.delta,0)+coalesce(m.delta,0))::numeric(18,2)
  from public.budget_app_wallet_accounts a left join ledger l on l.id=a.id left join movements m on m.id=a.id
  where a.owner_id=(select auth.uid());
$$;
grant execute on function public.budget_app_get_account_balances() to authenticated;

-- Record share sales using FIFO lot matching, preserving each purchase's all-in cost basis.
create or replace function public.budget_app_record_stock_trade(
  p_counter_id uuid, p_kind text, p_quantity numeric, p_unit_price numeric, p_fees numeric, p_occurred_at timestamptz, p_description text default ''
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare current_owner uuid := auth.uid(); acct_id uuid; available numeric; cash_available numeric; remaining numeric := p_quantity; matched_cost numeric := 0; lot record; take_qty numeric; new_trade uuid; net numeric;
begin
  select investment_account_id into acct_id from public.budget_app_investment_counters where id=p_counter_id and owner_id=current_owner;
  if acct_id is null then raise exception 'Choose a counter in your account'; end if;
  if p_kind not in ('buy','sell') or p_quantity <= 0 or p_unit_price <= 0 or p_fees < 0 then raise exception 'Enter valid trade details'; end if;
  if p_kind='buy' then
    select coalesce(sum(case when kind='deposit' then amount else -amount end),0) into cash_available
    from public.budget_app_investment_cash_movements where investment_account_id=acct_id and owner_id=current_owner;
    select cash_available + coalesce(sum(case when kind='buy' then -(round(quantity*unit_price,2)+fees) else round(quantity*unit_price,2)-fees end),0)
      into cash_available from public.budget_app_investment_trades where investment_account_id=acct_id and owner_id=current_owner;
    if round(p_quantity*p_unit_price,2)+p_fees > cash_available then raise exception 'This buy exceeds the available brokerage cash'; end if;
  end if;
  if p_kind='sell' then
    select coalesce(sum(t.quantity),0)-coalesce((select sum(m.quantity) from public.budget_app_investment_lot_matches m
      join public.budget_app_investment_trades s on s.id=m.sell_trade_id where s.counter_id=p_counter_id and s.owner_id=current_owner),0)
      into available from public.budget_app_investment_trades t
      where t.counter_id=p_counter_id and t.owner_id=current_owner and t.kind='buy';
    if p_quantity > available then raise exception 'You cannot sell more shares than you currently hold'; end if;
    insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
    values(current_owner,acct_id,p_counter_id,p_kind,p_quantity,p_unit_price,p_fees,p_occurred_at,left(coalesce(p_description,''),240)) returning id into new_trade;
    for lot in select id,quantity,unit_price,fees from public.budget_app_investment_trades
      where counter_id=p_counter_id and owner_id=current_owner and kind='buy' order by occurred_at,created_at,id loop
      exit when remaining <= 0;
      select coalesce(sum(quantity),0) into available from public.budget_app_investment_lot_matches where buy_trade_id=lot.id;
      take_qty := least(remaining, greatest(lot.quantity - available,0));
      if take_qty > 0 then
        matched_cost := matched_cost + round(take_qty * (lot.unit_price + (lot.fees / lot.quantity)),2);
        remaining := remaining - take_qty;
        insert into public.budget_app_investment_lot_matches(owner_id,buy_trade_id,sell_trade_id,quantity)
        values(current_owner,lot.id,new_trade,take_qty);
      end if;
    end loop;
    net := round(p_quantity*p_unit_price,2)-p_fees;
    update public.budget_app_investment_trades set realized_cost_basis=matched_cost, realized_profit=net-matched_cost where id=new_trade;
  else
    insert into public.budget_app_investment_trades(owner_id,investment_account_id,counter_id,kind,quantity,unit_price,fees,occurred_at,description)
    values(current_owner,acct_id,p_counter_id,p_kind,p_quantity,p_unit_price,p_fees,p_occurred_at,left(coalesce(p_description,''),240)) returning id into new_trade;
  end if;
  return new_trade;
end $$;
grant execute on function public.budget_app_record_stock_trade(uuid,text,numeric,numeric,numeric,timestamptz,text) to authenticated;
revoke execute on function public.budget_app_record_stock_trade(uuid,text,numeric,numeric,numeric,timestamptz,text) from public, anon;
revoke insert, update, delete on public.budget_app_investment_trades from authenticated;
revoke insert, update, delete on public.budget_app_investment_lot_matches from authenticated;
