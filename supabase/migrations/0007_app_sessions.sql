-- Server-owned inactivity state. No session tokens or financial data are stored here.
create table public.budget_app_sessions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  last_active_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);
alter table public.budget_app_sessions enable row level security;
revoke all on public.budget_app_sessions from public, anon, authenticated;
create index on public.budget_app_sessions(owner_id);

create function public.budget_app_session(p_id uuid, p_action text, p_idle_ms integer default 0)
returns timestamptz language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.budget_app_sessions%rowtype; t timestamptz := clock_timestamp();
begin
  if auth.uid() is null or p_id is null then return null; end if;
  if p_action='endAll' then
    update public.budget_app_sessions set revoked_at=t where owner_id=auth.uid() and revoked_at is null;
    return null;
  end if;
  if p_action='start' then
    -- UUID generated on the application server; never accept one from a form.
    insert into public.budget_app_sessions(id,owner_id) values(p_id,auth.uid());
    return t + interval '10 minutes';
  end if;
  select * into s from public.budget_app_sessions
    where id=p_id and owner_id=auth.uid() for update;
  if s.id is null or s.revoked_at is not null then return null; end if;
  if p_action='end' or s.last_active_at + interval '10 minutes' <= t then
    update public.budget_app_sessions set revoked_at=t where id=s.id;
    return null;
  end if;
  if p_action='touch' then
    -- Account for the short batching delay without trusting a client timestamp.
    update public.budget_app_sessions
      set last_active_at=greatest(last_active_at,t-make_interval(secs => greatest(0,least(coalesce(p_idle_ms,0),15000))/1000.0))
      where id=s.id returning * into s;
  elsif p_action<>'check' then
    raise exception 'Unknown session operation';
  end if;
  return s.last_active_at + interval '10 minutes';
end $$;
revoke all on function public.budget_app_session(uuid,text,integer) from public,anon;
grant execute on function public.budget_app_session(uuid,text,integer) to authenticated;
