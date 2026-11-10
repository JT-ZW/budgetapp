-- Project management overlays existing wallets; history imports never move cash.
create table if not exists public.budget_app_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  wallet_group_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description)<=1000),
  status text not null default 'active' check (status in ('active','completed')),
  setup_completed boolean not null default false,
  started_on date not null default (now() at time zone 'Africa/Harare')::date,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  unique(id,owner_id), unique(wallet_group_id), unique(owner_id,request_id),
  foreign key(wallet_group_id,owner_id) references public.budget_app_wallet_groups(id,owner_id)
);
create table if not exists public.budget_app_project_entries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  classification text not null check (classification in ('capex','opex','revenue')),
  transaction_id uuid unique,
  account_id uuid not null,
  amount numeric(18,2) not null check (amount>0),
  currency text not null check (currency in ('USD','ZIG')),
  occurred_on date not null,
  description text not null check (char_length(description) between 1 and 240),
  request_id uuid,
  created_at timestamptz not null default now(),
  unique(owner_id,request_id),
  foreign key(project_id,owner_id) references public.budget_app_projects(id,owner_id),
  foreign key(transaction_id,owner_id) references public.budget_app_transactions(id,owner_id),
  foreign key(account_id,owner_id) references public.budget_app_wallet_accounts(id,owner_id)
);
create table if not exists public.budget_app_project_funding (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null,
  account_id uuid not null,
  kind text not null check (kind in ('opening','contribution','grant','loan')),
  amount numeric(18,2) not null,
  currency text not null check (currency in ('USD','ZIG')),
  source_account_id uuid,
  transaction_id uuid unique,
  credit_id uuid unique,
  description text not null default '' check (char_length(description)<=240),
  occurred_on date not null,
  request_id uuid,
  created_at timestamptz not null default now(),
  unique(owner_id,request_id),
  check (kind='opening' or amount>0),
  check ((kind='opening' and transaction_id is null and credit_id is null and source_account_id is null)
    or (kind='loan' and credit_id is not null and source_account_id is not null and transaction_id is null)
    or (kind='contribution' and transaction_id is not null and source_account_id is not null and credit_id is null)
    or (kind='grant' and transaction_id is not null and source_account_id is null and credit_id is null)),
  foreign key(project_id,owner_id) references public.budget_app_projects(id,owner_id),
  foreign key(account_id,owner_id) references public.budget_app_wallet_accounts(id,owner_id),
  foreign key(source_account_id,owner_id) references public.budget_app_wallet_accounts(id,owner_id),
  foreign key(transaction_id,owner_id) references public.budget_app_transactions(id,owner_id),
  foreign key(credit_id,owner_id) references public.budget_app_credits(id,owner_id)
);
create index if not exists budget_app_project_entries_project_idx on public.budget_app_project_entries(project_id,occurred_on,id);
create index if not exists budget_app_project_funding_project_idx on public.budget_app_project_funding(project_id,occurred_on,id);
do $$ declare t text; begin
  foreach t in array array['budget_app_projects','budget_app_project_entries','budget_app_project_funding'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists project_owner_read on public.%I',t);
    execute format('create policy project_owner_read on public.%I for select to authenticated using(owner_id=(select auth.uid()))',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

create or replace function public.budget_app_manage_project(p_action text,p_data jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  u uuid:=auth.uid(); p public.budget_app_projects%rowtype;
  a public.budget_app_wallet_accounts%rowtype; b public.budget_app_wallet_accounts%rowtype;
  t public.budget_app_transactions%rowtype; e jsonb; x uuid; linked uuid; result_id uuid;
  request_key uuid; v numeric(18,2); available numeric; bucket text; funding_kind text;
  d date; today date:=(now() at time zone 'Africa/Harare')::date; counter integer:=0;
begin
  if u is null then raise exception 'Sign in to manage projects'; end if;
  if p_action='create' then
    request_key:=(p_data->>'request_id')::uuid;
    if request_key is null then raise exception 'Refresh and try creating the project again'; end if;
    -- Serialize setup so a wallet can only be assigned once, including retries.
    perform 1 from public.budget_app_wallet_groups where id=(p_data->>'wallet_group_id')::uuid and owner_id=u and kind='project' and archived_at is null for update;
    if not found then raise exception 'Choose an active project wallet; Personal stays separate'; end if;
    select id into result_id from public.budget_app_projects where owner_id=u and request_id=request_key;
    if result_id is not null then return result_id; end if;
    insert into public.budget_app_projects(owner_id,wallet_group_id,name,description,request_id)
    values(u,(p_data->>'wallet_group_id')::uuid,trim(p_data->>'name'),coalesce(p_data->>'description',''),request_key) returning * into p;
    insert into public.budget_app_project_funding(owner_id,project_id,account_id,kind,amount,currency,occurred_on,description)
    select u,p.id,wa.id,'opening',balances.balance,wa.currency,today,'Existing cash when wallet was connected'
    from public.budget_app_wallet_accounts wa join public.budget_app_get_account_balances() balances on balances.account_id=wa.id
    where wa.wallet_group_id=p.wallet_group_id and wa.owner_id=u and wa.archived_at is null;
    if not found then raise exception 'The selected wallet needs an active currency account'; end if;
    return p.id;
  end if;
  select * into p from public.budget_app_projects where id=(p_data->>'project_id')::uuid and owner_id=u for update;
  if p.id is null then raise exception 'Project not found'; end if;
  if p_action='update' then
    update public.budget_app_projects set name=trim(p_data->>'name'),description=coalesce(p_data->>'description',''),status=p_data->>'status' where id=p.id;
    return p.id;
  elsif p_action='finish_setup' then
    update public.budget_app_projects set setup_completed=true where id=p.id;
    return p.id;
  elsif p_action='remove_entry' then
    delete from public.budget_app_project_entries where id=(p_data->>'entry_id')::uuid and project_id=p.id and owner_id=u;
    return p.id;
  elsif p_action='unclassify_funding' then
    delete from public.budget_app_project_funding where id=(p_data->>'funding_id')::uuid and project_id=p.id and owner_id=u and kind='grant' and request_id is null;
    return p.id;
  elsif p_action='classify' then
    if jsonb_typeof(p_data->'entries') is distinct from 'array' or jsonb_array_length(p_data->'entries') not between 1 and 100 then raise exception 'Choose between 1 and 100 wallet entries'; end if;
    for e in select value from jsonb_array_elements(p_data->'entries') loop
      select * into t from public.budget_app_transactions where id=(e->>'transaction_id')::uuid and owner_id=u for update;
      bucket:=e->>'classification';
      if t.id is null or not exists(select 1 from public.budget_app_wallet_accounts where id=t.account_id and wallet_group_id=p.wallet_group_id and owner_id=u)
        or t.kind='transfer' or (t.occurred_at at time zone 'UTC')::date>today then raise exception 'Choose a recorded income or expense from this project wallet'; end if;
      if (t.kind='income' and (bucket is null or bucket not in ('revenue','funding'))) or (t.kind='expense' and (bucket is null or bucket not in ('capex','opex'))) then raise exception 'Classify income as revenue or funding, and expenses as capital or operating costs'; end if;
      if bucket='funding' and exists(select 1 from public.budget_app_project_funding where transaction_id=t.id and project_id=p.id and kind='grant') then continue; end if;
      if exists(select 1 from public.budget_app_project_funding where transaction_id=t.id) then raise exception 'Funding cannot also be counted as project revenue'; end if;
      if exists(select 1 from public.budget_app_project_entries where transaction_id=t.id and project_id<>p.id) then raise exception 'This entry already belongs to another project'; end if;
      if bucket='funding' then
        if exists(select 1 from public.budget_app_project_entries where transaction_id=t.id) then raise exception 'Remove the revenue classification before classifying this receipt as funding'; end if;
        insert into public.budget_app_project_funding(owner_id,project_id,account_id,kind,amount,currency,transaction_id,occurred_on,description)
        select u,p.id,t.account_id,'grant',t.amount,wa.currency,t.id,(t.occurred_at at time zone 'UTC')::date,coalesce(nullif(t.description,''),'Imported external funding') from public.budget_app_wallet_accounts wa where wa.id=t.account_id;
        continue;
      end if;
      insert into public.budget_app_project_entries(owner_id,project_id,classification,transaction_id,account_id,amount,currency,occurred_on,description)
      select u,p.id,bucket,t.id,t.account_id,t.amount,wa.currency,(t.occurred_at at time zone 'UTC')::date,coalesce(nullif(t.description,''),'Imported wallet activity') from public.budget_app_wallet_accounts wa where wa.id=t.account_id
      on conflict(transaction_id) do update set classification=excluded.classification;
    end loop;
    return p.id;
  end if;
  if p_action not in ('historical','record','fund','repay') then raise exception 'Unknown project operation'; end if;
  request_key:=(p_data->>'request_id')::uuid;
  if request_key is null then raise exception 'Refresh and try this entry again'; end if;
  select id into result_id from public.budget_app_project_entries where owner_id=u and project_id=p.id and request_id=request_key;
  if result_id is null then select id into result_id from public.budget_app_project_funding where owner_id=u and project_id=p.id and request_id=request_key; end if;
  if result_id is null then select r.result_id into result_id from public.budget_app_project_requests r where r.owner_id=u and r.project_id=p.id and r.request_id=request_key; end if;
  if result_id is not null then return result_id; end if;
  if p_action in ('record','fund','repay') and (not p.setup_completed or p.status<>'active') then raise exception 'Finish setup and use an active project before recording daily activity'; end if;
  if not exists(select 1 from public.budget_app_wallet_groups where id=p.wallet_group_id and owner_id=u and archived_at is null) then raise exception 'Restore the linked wallet before adding entries'; end if;
  if p_data->>'amount' is null or p_data->>'amount' !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$' then raise exception 'Enter an amount with up to two decimal places'; end if;
  v:=(p_data->>'amount')::numeric;
  if v<=0 then raise exception 'Amount must be greater than zero'; end if;
  if p_data->>'occurred_on' is null or p_data->>'occurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Choose a valid date'; end if;
  d:=(p_data->>'occurred_on')::date;
  if d>today then raise exception 'Choose today or an earlier date'; end if;
  if p_action='historical' and d>p.started_on then raise exception 'Opening history must be dated on or before project setup'; end if;
  if p_action in ('record','fund','repay') and d<p.started_on then raise exception 'Use opening history for dates before project setup'; end if;
  select * into a from public.budget_app_wallet_accounts where id=(p_data->>'account_id')::uuid and owner_id=u and wallet_group_id=p.wallet_group_id and archived_at is null;
  if a.id is null then raise exception 'Choose an active account in the project wallet'; end if;
  -- Lock source and destination accounts in a stable order.
  perform id from public.budget_app_wallet_accounts where owner_id=u and (id=a.id or id=(p_data->>'source_account_id')::uuid) order by id for update;
  if p_action in ('historical','record') then
    bucket:=p_data->>'classification';
    if bucket is null or bucket not in ('capex','opex','revenue') then raise exception 'Choose capital expenditure, operating expenditure, or revenue'; end if;
    if p_action='record' then
      if not exists(select 1 from public.budget_app_categories where id=(p_data->>'category_id')::uuid and owner_id=u and kind::text=case when bucket='revenue' then 'income' else 'expense' end) then raise exception 'Choose a matching transaction category'; end if;
      insert into public.budget_app_transactions(owner_id,kind,account_id,amount,category_id,description,occurred_at)
      values(u,(case when bucket='revenue' then 'income' else 'expense' end)::public.budget_app_transaction_kind,a.id,v,(p_data->>'category_id')::uuid,p_data->>'description',(d+time '12:00') at time zone 'UTC') returning id into linked;
    end if;
    insert into public.budget_app_project_entries(owner_id,project_id,classification,transaction_id,account_id,amount,currency,occurred_on,description,request_id)
    values(u,p.id,bucket,linked,a.id,v,a.currency,d,trim(p_data->>'description'),request_key) returning id into result_id;
    return result_id;
  elsif p_action='repay' then
    select id into x from public.budget_app_credits where id=(p_data->>'credit_id')::uuid and owner_id=u and kind='internal' and receiving_account_id in (select id from public.budget_app_wallet_accounts where wallet_group_id=p.wallet_group_id and owner_id=u);
    if x is null then raise exception 'Choose a loan belonging to this project'; end if;
    select balance into available from public.budget_app_get_account_balances() where account_id=a.id;
    if v>available then raise exception 'Repayment exceeds cash available in this project account'; end if;
    linked:=public.budget_app_manage_credit('repay',jsonb_build_object('credit_id',x,'account_id',a.id,'principal',v::text,'charges','0','occurred_on',d::text));
    -- Funding rows with negative repayments would obscure funding received. A separate
    -- project receipt tracks retry identity; credit movements remain the loan ledger.
    insert into public.budget_app_project_requests(owner_id,request_id,project_id,result_id) values(u,request_key,p.id,linked);
    return linked;
  end if;
  funding_kind:=p_data->>'kind';
  if funding_kind is null or funding_kind not in ('contribution','grant','loan') then raise exception 'Choose a contribution, external funding, or wallet loan'; end if;
  if funding_kind in ('contribution','loan') then
    select * into b from public.budget_app_wallet_accounts where id=(p_data->>'source_account_id')::uuid and owner_id=u and archived_at is null;
    if b.id is null or b.wallet_group_id=p.wallet_group_id or b.currency<>a.currency or not exists(select 1 from public.budget_app_wallet_groups where id=b.wallet_group_id and owner_id=u and archived_at is null) then raise exception 'Choose another active wallet account in the same currency'; end if;
    select balance into available from public.budget_app_get_account_balances() where account_id=b.id;
    if v>available then raise exception 'Funding exceeds the available source wallet balance'; end if;
  end if;
  if funding_kind='loan' then
    if p_data->>'due_on' is null or (p_data->>'due_on')::date<d then raise exception 'The repayment date cannot be before funding'; end if;
    x:=public.budget_app_manage_credit('create',jsonb_build_object('kind','internal','name',left('Project: '||p.name,100),'receiving_account_id',a.id,'lending_account_id',b.id,'principal',v::text,'charges','0','borrowed_on',d::text,'due_on',p_data->>'due_on','notes',coalesce(p_data->>'description','')));
  elsif funding_kind='contribution' then
    insert into public.budget_app_transactions(owner_id,kind,account_id,destination_account_id,amount,destination_amount,description,occurred_at)
    values(u,'transfer',b.id,a.id,v,v,'Project contribution: '||p.name,(d+time '12:00') at time zone 'UTC') returning id into linked;
  else
    if not exists(select 1 from public.budget_app_categories where id=(p_data->>'category_id')::uuid and owner_id=u and kind='income') then raise exception 'Choose an income category for external funding'; end if;
    insert into public.budget_app_transactions(owner_id,kind,account_id,amount,category_id,description,occurred_at)
    values(u,'income',a.id,v,(p_data->>'category_id')::uuid,'Project funding: '||p.name,(d+time '12:00') at time zone 'UTC') returning id into linked;
  end if;
  insert into public.budget_app_project_funding(owner_id,project_id,account_id,kind,amount,currency,source_account_id,transaction_id,credit_id,description,occurred_on,request_id)
  values(u,p.id,a.id,funding_kind,v,a.currency,b.id,linked,x,coalesce(p_data->>'description',''),d,request_key) returning id into result_id;
  return result_id;
end $$;

-- Retry receipts for loan repayments contain no additional financial movements.
create table if not exists public.budget_app_project_requests (
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  project_id uuid not null,
  result_id uuid not null,
  primary key(owner_id,request_id),
  foreign key(project_id,owner_id) references public.budget_app_projects(id,owner_id)
);
alter table public.budget_app_project_requests enable row level security;
revoke all on public.budget_app_project_requests from public,anon,authenticated;
drop policy if exists project_request_owner_read on public.budget_app_project_requests;
create policy project_request_owner_read on public.budget_app_project_requests for select to authenticated using(owner_id=(select auth.uid()));
grant select on public.budget_app_project_requests to authenticated;
revoke all on function public.budget_app_manage_project(text,jsonb) from public,anon;
grant execute on function public.budget_app_manage_project(text,jsonb) to authenticated;

create or replace function public.budget_app_protect_project_transaction()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if exists(select 1 from public.budget_app_project_entries where transaction_id=old.id)
    or exists(select 1 from public.budget_app_project_funding where transaction_id=old.id) then
    if new is distinct from old then raise exception 'This transaction is linked to project reporting. Unclassify it before changing it'; end if;
  end if;
  return new;
end $$;
revoke all on function public.budget_app_protect_project_transaction() from public,anon;
drop trigger if exists budget_app_project_transaction_guard on public.budget_app_transactions;
create trigger budget_app_project_transaction_guard before update on public.budget_app_transactions for each row execute function public.budget_app_protect_project_transaction();
