-- ============================================================================
--  What is actually in this database?
--
--  Run this first when a migration will not apply. It changes nothing, and it
--  distinguishes the two cases that look identical from the outside: the base
--  schema was never applied here, or it was and only the new parts are missing.
-- ============================================================================

select 'org_role type exists' as thing,
       case when exists (
         select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
         where n.nspname = 'public' and t.typname = 'org_role'
       ) then 'yes' else 'NO — the base schema is not in this project' end as state

union all
select 'roles currently defined',
       coalesce((
         select string_agg(e.enumlabel, ', ' order by e.enumsortorder)
         from pg_type t
         join pg_namespace n on n.oid = t.typnamespace
         join pg_enum e on e.enumtypid = t.oid
         where n.nspname = 'public' and t.typname = 'org_role'
       ), 'none')

union all
select 'organizations table',
       case when to_regclass('public.organizations') is not null then 'yes' else 'NO' end

union all
select 'brands table',
       case when to_regclass('public.brands') is not null then 'yes' else 'NO' end

union all
select 'memberships table',
       case when to_regclass('public.memberships') is not null then 'yes' else 'NO' end

union all
select 'transactions table',
       case when to_regclass('public.transactions') is not null then 'yes' else 'NO' end

union all
select 'how many organisations',
       case when to_regclass('public.organizations') is null then 'n/a'
            else (select count(*)::text from public.organizations) end

union all
select 'already has membership_brands',
       case when to_regclass('public.membership_brands') is not null
            then 'yes — step 2 has run before' else 'no' end

union all
select 'postgres version',
       (select current_setting('server_version'));
