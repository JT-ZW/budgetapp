-- Add loans made to other people without changing existing borrowing records.
-- receiving_account_id stores the original wallet; lender stores the counterparty.
alter table public.budget_app_credits drop constraint budget_app_credits_kind_check;
alter table public.budget_app_credits add constraint budget_app_credits_kind_check check(kind in ('internal','external','lent'));
alter table public.budget_app_credits drop constraint budget_app_credits_check1;
alter table public.budget_app_credits add constraint budget_app_credits_parties_check check (
  (kind='internal' and lending_account_id is not null and lending_account_id<>receiving_account_id and charges=0)
  or (kind='external' and lending_account_id is null and char_length(trim(lender)) between 1 and 100)
  or (kind='lent' and lending_account_id is null and charges=0 and char_length(trim(lender)) between 1 and 100)
);
alter table public.budget_app_credit_movements drop constraint budget_app_credit_movements_kind_check;
alter table public.budget_app_credit_movements add constraint budget_app_credit_movements_kind_check check(kind in ('borrow','repay','lend','collect'));

create or replace function public.budget_app_manage_credit(p_action text, p_data jsonb)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  u uuid := auth.uid(); c public.budget_app_credits%rowtype;
  a public.budget_app_wallet_accounts%rowtype; b public.budget_app_wallet_accounts%rowtype;
  result_id uuid; principal_paid numeric; charges_paid numeric; planned numeric;
  principal_amount numeric(18,2); charge_amount numeric(18,2); payment_date date; expense_id uuid; field_name text;
begin
  if u is null then raise exception 'Sign in to manage credit'; end if;
  foreach field_name in array array['principal','charges','amount'] loop
    if p_data ? field_name and (p_data->>field_name is null or p_data->>field_name !~ '^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$') then
      raise exception 'Enter amounts with up to two decimal places';
    end if;
  end loop;
  if p_action='create' then
    select * into a from public.budget_app_wallet_accounts where id=(p_data->>'receiving_account_id')::uuid and owner_id=u and archived_at is null for update;
    if a.id is null or not exists(select 1 from public.budget_app_wallet_groups where id=a.wallet_group_id and owner_id=u and archived_at is null) then raise exception 'Choose an active wallet'; end if;
    if p_data->>'kind'='lent' and (p_data->>'charges')::numeric<>0 then raise exception 'Lending records track principal only'; end if;
    if p_data->>'kind'='internal' then
      select * into b from public.budget_app_wallet_accounts where id=(p_data->>'lending_account_id')::uuid and owner_id=u and archived_at is null for update;
      if b.id is null or b.id=a.id or b.currency<>a.currency or not exists(select 1 from public.budget_app_wallet_groups where id=b.wallet_group_id and owner_id=u and archived_at is null) then raise exception 'Choose a different active lending wallet in the same currency'; end if;
    end if;
    insert into public.budget_app_credits(owner_id,name,kind,lender,lending_account_id,receiving_account_id,currency,principal,charges,borrowed_on,due_on,notes)
    values(u,trim(p_data->>'name'),p_data->>'kind',trim(coalesce(p_data->>'lender','')),b.id,a.id,a.currency,
      (p_data->>'principal')::numeric,(p_data->>'charges')::numeric,(p_data->>'borrowed_on')::date,(p_data->>'due_on')::date,coalesce(p_data->>'notes','')) returning * into c;
    if c.borrowed_on>(now() at time zone 'Africa/Harare')::date then raise exception 'Loan date cannot be in the future'; end if;
    insert into public.budget_app_credit_movements(owner_id,credit_id,kind,account_id,destination_account_id,principal,occurred_on)
    values(u,c.id,case when c.kind='lent' then 'lend' else 'borrow' end,coalesce(b.id,a.id),case when b.id is not null then a.id end,c.principal,c.borrowed_on);
    return c.id;
  end if;
  select * into c from public.budget_app_credits where id=(p_data->>'credit_id')::uuid and owner_id=u for update;
  if c.id is null then raise exception 'Credit record not found'; end if;
  select coalesce(sum(principal),0),coalesce(sum(charges),0) into principal_paid,charges_paid
    from public.budget_app_credit_movements where credit_id=c.id and owner_id=u and kind in ('repay','collect');
  if p_action='instalment' then
    payment_date := (p_data->>'due_on')::date;
    if payment_date<c.borrowed_on or payment_date>c.due_on then raise exception 'Instalment date must fall between borrowing and final repayment dates'; end if;
    select coalesce(sum(amount),0) into planned from public.budget_app_credit_instalments where credit_id=c.id;
    if planned+(p_data->>'amount')::numeric>c.principal+c.charges then raise exception 'Instalments cannot exceed the total amount owed'; end if;
    insert into public.budget_app_credit_instalments(owner_id,credit_id,due_on,amount) values(u,c.id,payment_date,(p_data->>'amount')::numeric) returning id into result_id;
    return result_id;
  elsif p_action='removeInstalment' then
    delete from public.budget_app_credit_instalments where id=(p_data->>'instalment_id')::uuid and credit_id=c.id and owner_id=u;
    return c.id;
  elsif p_action='dueDate' then
    payment_date := (p_data->>'due_on')::date;
    if exists(select 1 from public.budget_app_credit_instalments where credit_id=c.id and due_on>payment_date) then raise exception 'Final date cannot be before an existing instalment'; end if;
    update public.budget_app_credits set due_on=payment_date where id=c.id;
    return c.id;
  elsif p_action='repay' then
    principal_amount := (p_data->>'principal')::numeric;
    charge_amount := (p_data->>'charges')::numeric;
    payment_date := (p_data->>'occurred_on')::date;
    if principal_amount is null or charge_amount is null or principal_amount<0 or charge_amount<0 or principal_amount+charge_amount<=0 then raise exception 'Enter a positive repayment'; end if;
    if principal_paid+principal_amount>c.principal or charges_paid+charge_amount>c.charges then raise exception 'Payment exceeds remaining principal or charges'; end if;
    if payment_date is null or payment_date<c.borrowed_on or payment_date>(now() at time zone 'Africa/Harare')::date then raise exception 'Choose a payment date between borrowing and today'; end if;
    select * into a from public.budget_app_wallet_accounts where id=(p_data->>'account_id')::uuid and owner_id=u and archived_at is null for update;
    if a.id is null or a.currency<>c.currency or a.id=c.lending_account_id or not exists(select 1 from public.budget_app_wallet_groups where id=a.wallet_group_id and owner_id=u and archived_at is null) then raise exception 'Choose an active repayment wallet in the loan currency, different from the internal lending wallet'; end if;
    if c.kind='lent' and charge_amount<>0 then raise exception 'Lending records track principal only'; end if;
    if charge_amount>0 then
      if not exists(select 1 from public.budget_app_categories where id=(p_data->>'category_id')::uuid and owner_id=u and kind='expense') then raise exception 'Choose an expense category for interest and fees'; end if;
      insert into public.budget_app_transactions(owner_id,kind,account_id,amount,category_id,description,occurred_at)
      values(u,'expense',a.id,charge_amount,(p_data->>'category_id')::uuid,'Credit interest / fees: '||c.name,payment_date+time '12:00') returning id into expense_id;
    end if;
    insert into public.budget_app_credit_movements(owner_id,credit_id,kind,account_id,destination_account_id,principal,charges,occurred_on,expense_transaction_id)
    values(u,c.id,case when c.kind='lent' then 'collect' else 'repay' end,a.id,c.lending_account_id,principal_amount,charge_amount,payment_date,expense_id) returning id into result_id;
    return result_id;
  end if;
  raise exception 'Unknown credit operation';
end $$;
revoke all on function public.budget_app_manage_credit(text,jsonb) from public,anon;
grant execute on function public.budget_app_manage_credit(text,jsonb) to authenticated;


create or replace function public.budget_app_get_account_balances()
returns table(account_id uuid,balance numeric(18,2)) language sql stable security invoker set search_path=public,pg_temp as $$
  with deltas as (
    select t.account_id as id, case when kind='income' then amount when kind='expense' then -amount else -(amount+fee_amount) end as delta
    from public.budget_app_transactions t where owner_id=(select auth.uid())
    union all select destination_account_id,destination_amount from public.budget_app_transactions where kind='transfer' and owner_id=(select auth.uid())
    union all select wallet_account_id,case when kind='deposit' then -amount else amount end from public.budget_app_investment_cash_movements where owner_id=(select auth.uid())
    union all select account_id,case when kind in ('borrow','collect') and destination_account_id is null then principal else -principal end from public.budget_app_credit_movements where owner_id=(select auth.uid())
    union all select destination_account_id,principal from public.budget_app_credit_movements where destination_account_id is not null and owner_id=(select auth.uid())
  )
  select a.id,(a.opening_balance+coalesce(sum(d.delta),0))::numeric(18,2)
  from public.budget_app_wallet_accounts a left join deltas d on d.id=a.id
  where a.owner_id=(select auth.uid()) group by a.id;
$$;
