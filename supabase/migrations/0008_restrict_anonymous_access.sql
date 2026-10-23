-- Remove Supabase default anonymous grants from this application's objects only.
-- Existing authenticated privileges and owner RLS policies remain in effect.
-- No financial records are changed. Safe to rerun after future app migrations.
begin;
do $$
declare object record;
begin
  for object in
    select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and starts_with(c.relname,'budget_app_')
  loop
    execute format('revoke all on table public.%I from public, anon',object.relname);
  end loop;
  for object in
    select p.oid::regprocedure as signature from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prokind='f' and starts_with(p.proname,'budget_app_')
  loop
    execute format('revoke all on function %s from public, anon',object.signature);
  end loop;
end $$;
commit;
