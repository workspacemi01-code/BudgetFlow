-- ============================================================================
--  BudgetFlow — STEP 2 of 2
--
--  Run only after step 1 has finished.
--
--  Adds: unit-level membership, the officer spending rule, the daily spend
--  view the dashboard filters on, and a per-organisation palette column.
--
--  Safe to re-run — every object uses `if not exists` or `create or replace`.
--  Nothing existing is changed: every unit defaults to open to officers, and
--  every organisation defaults to the standard palette, so nobody loses
--  access or changes colour until you say so.
-- ============================================================================


-- ---------------- 0006_unit_scoping.sql ----------------

-- Unit-level roles, part two: scoping, and the rules that go with it.
--
-- Until now a member was scoped to departments only, so "this person runs the
-- Creative Unit" had nowhere to live. Two things change:
--
--   1. membership_brands — a member can now be attached to individual units
--      (the level-2 entity, whatever an org calls it: Brand, Unit, Cost Center).
--
--   2. brands.officers_can_spend — the rule "Officers cannot spend within the
--      Sosa budget" is recorded as data on the unit, not as a name in code. Any
--      unit can be closed to officers, and Sosa is simply the first one that is.
--
-- The permission shape the business asked for:
--
--   Super Admin (owner/admin)  everything, everywhere.
--   Finance                    everything, everywhere.
--   Department Manager         their departments, including every unit inside
--                              them; approves all spending in the department.
--   Unit/Line Manager          edits their own units; sees the rest of their
--                              department read-only; sends approvals upward.
--   Officer                    spends in their own units, unless a unit is
--                              closed to officers; never edits a budget; sees
--                              the rest of the department read-only.
--   Viewer                     unchanged.


-- -----------------------------------------------------------------------------
-- 1. A member can belong to individual units
-- -----------------------------------------------------------------------------

create table if not exists public.membership_brands (
  membership_id uuid not null,
  brand_id      uuid not null,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (membership_id, brand_id),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (brand_id, org_id) references public.brands (id, org_id) on delete cascade
);

create index if not exists membership_brands_brand_id_idx on public.membership_brands (brand_id);
create index if not exists membership_brands_org_id_idx   on public.membership_brands (org_id);

comment on table public.membership_brands is
  'Units a member is attached to. A line manager edits these; an officer spends in them.';

alter table public.membership_brands enable row level security;

/* Dropped first so the whole file can be re-run. Someone will run it twice —
   losing the tab, or wondering whether the first attempt took. */
drop policy if exists membership_brands_select on public.membership_brands;
create policy membership_brands_select on public.membership_brands for select to authenticated
  using (private.is_org_member(org_id));

drop policy if exists membership_brands_insert on public.membership_brands;
create policy membership_brands_insert on public.membership_brands for insert to authenticated
  with check (private.is_org_admin(org_id));

drop policy if exists membership_brands_delete on public.membership_brands;
create policy membership_brands_delete on public.membership_brands for delete to authenticated
  using (private.is_org_admin(org_id));

drop trigger if exists membership_brands_audit on public.membership_brands;
create trigger membership_brands_audit
  after insert or update or delete on public.membership_brands
  for each row execute function private.audit_row();


-- -----------------------------------------------------------------------------
-- 2. A unit can be closed to officers
-- -----------------------------------------------------------------------------

alter table public.brands
  add column if not exists officers_can_spend boolean not null default true;

comment on column public.brands.officers_can_spend is
  'False closes this unit to officers. Set false on Sosa: officers may see it, never spend against it.';


-- -----------------------------------------------------------------------------
-- 3. Who can see a department
--
-- The two new roles see their whole department — the brief is explicit that a
-- line manager "can view other brands/units within the department". Being
-- attached to a unit is therefore enough to see the department it sits in.
-- -----------------------------------------------------------------------------

create or replace function private.can_view_department(p_org uuid, p_department uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = p_department)
      when m.role in ('line_manager', 'officer') then
        exists (
          select 1 from public.membership_departments md
          where md.membership_id = m.id and md.department_id = p_department)
        or exists (
          select 1 from public.membership_brands mb
          join public.brands b on b.id = mb.brand_id
          where mb.membership_id = m.id and b.department_id = p_department)
      when m.role = 'viewer' then
        not exists (select 1 from public.membership_departments md where md.membership_id = m.id)
        or exists (
          select 1 from public.membership_departments md
          where md.membership_id = m.id and md.department_id = p_department)
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;


-- -----------------------------------------------------------------------------
-- 4. Who can change a department
--
-- Unchanged in effect: editing at department level stays with managers and
-- above. A line manager's authority is a unit, not a department, and an officer
-- has none — both are spelled out here rather than left to fall through, so the
-- answer is visible when someone reads this function.
-- -----------------------------------------------------------------------------

create or replace function private.can_edit_department(p_org uuid, p_department uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = p_department)
      when m.role in ('line_manager', 'officer') then false
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;


-- -----------------------------------------------------------------------------
-- 5. Unit-level rules
-- -----------------------------------------------------------------------------

-- Seeing a unit follows seeing its department, which is what "can view other
-- brands/units within the department" means.
create or replace function private.can_view_brand(p_org uuid, p_brand uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_view_department(b.org_id, b.department_id)
    from public.brands b where b.id = p_brand and b.org_id = p_org
  ), false)
$$;

-- Changing a unit is narrower: a line manager may change the units they are
-- attached to and no others, however much of the department they can see.
create or replace function private.can_edit_brand(p_org uuid, p_brand uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1
        from public.membership_departments md
        join public.brands b on b.department_id = md.department_id
        where md.membership_id = m.id and b.id = p_brand)
      when m.role = 'line_manager' then exists (
        select 1 from public.membership_brands mb
        where mb.membership_id = m.id and mb.brand_id = p_brand)
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;

-- Spending is its own question, because an officer spends without editing.
-- Two conditions, both required: the officer is attached to the unit, and the
-- unit is open to officers. That second half is the Sosa rule.
create or replace function private.can_spend_brand(p_org uuid, p_brand uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1
        from public.membership_departments md
        join public.brands b on b.department_id = md.department_id
        where md.membership_id = m.id and b.id = p_brand)
      when m.role = 'line_manager' then exists (
        select 1 from public.membership_brands mb
        where mb.membership_id = m.id and mb.brand_id = p_brand)
      when m.role = 'officer' then exists (
        select 1
        from public.membership_brands mb
        join public.brands b on b.id = mb.brand_id
        where mb.membership_id = m.id
          and mb.brand_id = p_brand
          and b.officers_can_spend)
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;


-- -----------------------------------------------------------------------------
-- 6. Budget lines follow their unit when they have one
--
-- A line with no brand_id belongs to the department as a whole, so it keeps the
-- department rule. A line inside a unit asks the unit.
-- -----------------------------------------------------------------------------

create or replace function private.can_view_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when bl.brand_id is null then private.can_view_department(bl.org_id, bl.department_id)
      else private.can_view_brand(bl.org_id, bl.brand_id)
    end
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;

create or replace function private.can_edit_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when bl.brand_id is null then private.can_edit_department(bl.org_id, bl.department_id)
      else private.can_edit_brand(bl.org_id, bl.brand_id)
    end
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;

-- Recording spend against a line is the spend question, not the edit question:
-- an officer who may not touch the budget may still book a transaction on it.
create or replace function private.can_spend_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when bl.brand_id is null then private.can_edit_department(bl.org_id, bl.department_id)
      else private.can_spend_brand(bl.org_id, bl.brand_id)
    end
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;

grant execute on function private.can_view_brand(uuid, uuid)  to authenticated;
grant execute on function private.can_edit_brand(uuid, uuid)  to authenticated;
grant execute on function private.can_spend_brand(uuid, uuid) to authenticated;
grant execute on function private.can_spend_line(uuid)        to authenticated;


-- -----------------------------------------------------------------------------
-- 7. Recording spend is governed by the spend rule, not the edit rule
--
-- Without this the new functions would be dead code: an officer's whole job is
-- to book spend on a budget they may not edit, and transactions_insert asked
-- can_edit_line. Everyone who could write a transaction before still can —
-- can_spend_line delegates to can_edit_department for a department-level line,
-- and answers true for every role that can_edit_brand answers true for.
-- -----------------------------------------------------------------------------

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
  with check (private.can_spend_line(budget_line_id));

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions for update to authenticated
  using (private.can_spend_line(budget_line_id))
  with check (private.can_spend_line(budget_line_id));


-- ---------------- 0007_daily_spend.sql ----------------

-- Spend by day, by unit.
--
-- v_monthly_summary is grouped by month and carries no brand, so it cannot
-- answer either half of what the dashboard now needs: a week view, and a
-- filter down to a single unit. Rather than add a second monthly view beside
-- it, this groups one level finer than the finest thing asked for — by day —
-- and the application folds days into weeks, months or years.
--
-- Grouping by day rather than returning raw transactions matters: a year of a
-- department's spend is thousands of rows, and the dashboard was already slow.
-- Distinct (department, unit, day) is a few hundred at most.
--
-- security_invoker, like every other view here, so a line manager sees exactly
-- the units their membership allows and no more.

create or replace view public.v_daily_spend
with (security_invoker = true)
as
select
  t.org_id,
  t.period_id,
  t.department_id,
  t.department_name,
  t.brand_id,
  t.brand_name,
  t.txn_date::date                           as day,
  count(*)                                   as transaction_count,
  sum(t.spent_amount)::numeric(18, 2)        as spent,
  sum(t.committed_amount)::numeric(18, 2)    as committed
from public.v_transactions t
where t.status not in ('draft', 'rejected', 'voided')
group by
  t.org_id, t.period_id, t.department_id, t.department_name,
  t.brand_id, t.brand_name, t.txn_date::date;

comment on view public.v_daily_spend is
  'Spend and commitment per day per unit. The dashboard folds these into weeks, months or years.';

grant select on public.v_daily_spend to authenticated;


-- ---------------- 0008_org_brand_theme.sql ----------------

-- A brand palette per organisation.
--
-- The first attempt at this painted the whole product in one customer's
-- colours, which was wrong twice over: every other organisation inherited a
-- palette that is not theirs, and because the brand colour was red, an
-- over-budget warning stopped standing out — the page was already red
-- everywhere, so "you have overspent" looked like every button on it.
--
-- So the palette belongs to the organisation, and a named theme rather than a
-- free hex: a hex column would let anyone set a colour that fails contrast
-- against white text, or that collides with the red reserved for warnings.
-- Each named theme is tuned once, including its warning colour.

alter table public.organizations
  add column if not exists brand_theme text not null default 'default';

alter table public.organizations
  drop constraint if exists organizations_brand_theme_check;

alter table public.organizations
  add constraint organizations_brand_theme_check
  check (brand_theme in ('default', 'crimson'));

comment on column public.organizations.brand_theme is
  'Named palette for this org. default = teal; crimson = red with navy. Each theme keeps its warning colour distinct from its brand colour.';


-- ---------------- 0009_unit_table_grants.sql ----------------

-- Table privileges for the objects 0006 and 0007 created.
--
-- 0001 ends with:
--
--   grant select, insert, update, delete on all tables in schema public to authenticated;
--
-- which reads like a standing rule and is not one. It grants on the tables that
-- exist at that moment; anything created afterwards gets nothing. 0002 was
-- written about this same trap for service_role and still did not make it a
-- default, so every new table has to say so itself.
--
-- The effect was that membership_brands had row-level policies deciding who may
-- read which rows, and no privilege to read the table at all — so every query
-- against it failed with "permission denied for table membership_brands", and
-- the Settings page, which reads a member's units, failed to load entirely.
--
-- Worth noting why the tests missed it: the permission functions are
-- security definer, so they read membership_brands as the definer and were
-- unaffected. Only a query made *as* the signed-in user touches the grant, and
-- nothing exercised that path until the real app did.

grant select, insert, update, delete on public.membership_brands to authenticated;
grant select, insert, update, delete on public.membership_brands to service_role;

grant select on public.v_daily_spend to authenticated;
grant select on public.v_daily_spend to service_role;


-- ============================================================================
--  Verification — every row should read OK.
-- ============================================================================

select 'roles exist' as check,
       case when count(*) = 2 then 'OK' else 'MISSING' end as result
from   unnest(enum_range(null::public.org_role)) r
where  r::text in ('line_manager', 'officer')
union all
select 'membership_brands table',
       case when to_regclass('public.membership_brands') is not null then 'OK' else 'MISSING' end
union all
select 'brands.officers_can_spend',
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='brands' and column_name='officers_can_spend')
       then 'OK' else 'MISSING' end
union all
select 'organizations.brand_theme',
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='organizations' and column_name='brand_theme')
       then 'OK' else 'MISSING' end
union all
select 'v_daily_spend view',
       case when to_regclass('public.v_daily_spend') is not null then 'OK' else 'MISSING' end
union all
select 'app can read membership_brands',
       case when has_table_privilege('authenticated', 'public.membership_brands', 'SELECT')
       then 'OK' else 'MISSING GRANT' end
union all
select 'spend rule wired to transactions',
       case when exists (select 1 from pg_policies
         where schemaname='public' and tablename='transactions'
           and policyname='transactions_insert' and with_check like '%can_spend_line%')
       then 'OK' else 'STILL ON can_edit_line' end;
