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


-- ---------------- 0010_units.sql ----------------

-- The third level: Department → Brand → Unit.
--
-- The schema stopped at two. "Marketing → Sosa Brand" could be said; "Marketing
-- → Sosa Brand → Events" could not, and an officer belongs to that third thing,
-- not to the brand above it.
--
-- So units sit under brands, officers and unit managers attach to units, and a
-- budget line may sit at any of the three depths:
--
--   department only          a cost the department carries as a whole
--   department + brand       a cost the brand carries across its units
--   department + brand + unit  a cost one unit carries
--
-- Spending stays closed where it was closed. officers_can_spend remains on the
-- brand, because that is the level the business named — "officers cannot spend
-- within the Sosa budget" is about Sosa, and every unit inside it. A unit can
-- also be closed on its own without closing its siblings.


-- -----------------------------------------------------------------------------
-- 1. Units
-- -----------------------------------------------------------------------------

create table if not exists public.units (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  brand_id    uuid not null,
  name        text not null check (char_length(name) between 1 and 120),
  code        text check (char_length(code) between 1 and 20),
  /* Closes this unit alone. The brand's own flag closes every unit in it. */
  officers_can_spend boolean not null default true,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (id, brand_id),
  unique (brand_id, name),
  foreign key (brand_id, org_id) references public.brands (id, org_id) on delete cascade
);

create index if not exists units_brand_id_idx on public.units (brand_id);
create index if not exists units_org_id_idx   on public.units (org_id);

comment on table public.units is
  'The level below a brand. An officer belongs to a unit; a unit manager edits one.';

alter table public.units enable row level security;

drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated
  using (private.can_view_brand(org_id, brand_id));

drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (private.can_edit_brand(org_id, brand_id))
  with check (private.can_edit_brand(org_id, brand_id));

grant select, insert, update, delete on public.units to authenticated;
grant select, insert, update, delete on public.units to service_role;

drop trigger if exists units_set_updated_at on public.units;
create trigger units_set_updated_at before update on public.units
  for each row execute function private.set_updated_at();

drop trigger if exists units_audit on public.units;
create trigger units_audit after insert or update or delete on public.units
  for each row execute function private.audit_row();


-- -----------------------------------------------------------------------------
-- 2. People belong to units
-- -----------------------------------------------------------------------------

create table if not exists public.membership_units (
  membership_id uuid not null,
  unit_id       uuid not null,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (membership_id, unit_id),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (unit_id, org_id) references public.units (id, org_id) on delete cascade
);

create index if not exists membership_units_unit_id_idx on public.membership_units (unit_id);
create index if not exists membership_units_org_id_idx  on public.membership_units (org_id);

alter table public.membership_units enable row level security;

drop policy if exists membership_units_select on public.membership_units;
create policy membership_units_select on public.membership_units for select to authenticated
  using (private.is_org_member(org_id));

drop policy if exists membership_units_insert on public.membership_units;
create policy membership_units_insert on public.membership_units for insert to authenticated
  with check (private.is_org_admin(org_id));

drop policy if exists membership_units_delete on public.membership_units;
create policy membership_units_delete on public.membership_units for delete to authenticated
  using (private.is_org_admin(org_id));

/* Said explicitly, because 0001's blanket grant only covered the tables that
   existed when it ran — the omission that broke the Settings page once already. */
grant select, insert, update, delete on public.membership_units to authenticated;
grant select, insert, update, delete on public.membership_units to service_role;

drop trigger if exists membership_units_audit on public.membership_units;
create trigger membership_units_audit
  after insert or update or delete on public.membership_units
  for each row execute function private.audit_row();


-- -----------------------------------------------------------------------------
-- 3. A budget line can sit on a unit
-- -----------------------------------------------------------------------------

alter table public.budget_lines
  add column if not exists unit_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'budget_lines_unit_id_brand_id_fkey'
  ) then
    alter table public.budget_lines
      add constraint budget_lines_unit_id_brand_id_fkey
      foreign key (unit_id, brand_id) references public.units (id, brand_id);
  end if;
end $$;

/* The uniqueness of a line now includes its unit: Marketing → Sosa → Events →
   Advertising and Marketing → Sosa → Creative → Advertising are two lines, not
   a conflict. */
alter table public.budget_lines
  drop constraint if exists budget_lines_period_id_department_id_brand_id_category_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'budget_lines_period_dept_brand_unit_category_key'
  ) then
    alter table public.budget_lines
      add constraint budget_lines_period_dept_brand_unit_category_key
      unique nulls not distinct (period_id, department_id, brand_id, unit_id, category_id);
  end if;
end $$;

create index if not exists budget_lines_unit_id_idx on public.budget_lines (unit_id);


-- -----------------------------------------------------------------------------
-- 4. The rules, at unit level
-- -----------------------------------------------------------------------------

-- Seeing a unit follows seeing its brand, which follows seeing its department.
-- A unit manager still reads the rest of the department; only editing narrows.
create or replace function private.can_view_unit(p_org uuid, p_unit uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_view_brand(u.org_id, u.brand_id)
    from public.units u where u.id = p_unit and u.org_id = p_org
  ), false)
$$;

create or replace function private.can_edit_unit(p_org uuid, p_unit uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      /* A department manager runs everything inside their department. */
      when m.role = 'dept_manager' then exists (
        select 1
        from public.membership_departments md
        join public.brands b on b.department_id = md.department_id
        join public.units u on u.brand_id = b.id
        where md.membership_id = m.id and u.id = p_unit)
      /* A unit manager edits the units they hold, and no others. */
      when m.role = 'line_manager' then exists (
        select 1 from public.membership_units mu
        where mu.membership_id = m.id and mu.unit_id = p_unit)
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;

-- Spending is its own question: an officer spends without editing. Closed is
-- closed at either level — the brand shuts all its units, a unit shuts itself.
create or replace function private.can_spend_unit(p_org uuid, p_unit uuid)
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
        join public.units u on u.brand_id = b.id
        where md.membership_id = m.id and u.id = p_unit)
      when m.role = 'line_manager' then exists (
        select 1 from public.membership_units mu
        where mu.membership_id = m.id and mu.unit_id = p_unit)
      when m.role = 'officer' then exists (
        select 1
        from public.membership_units mu
        join public.units u on u.id = mu.unit_id
        join public.brands b on b.id = u.brand_id
        where mu.membership_id = m.id
          and mu.unit_id = p_unit
          and u.officers_can_spend
          and b.officers_can_spend)
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;

grant execute on function private.can_view_unit(uuid, uuid)  to authenticated;
grant execute on function private.can_edit_unit(uuid, uuid)  to authenticated;
grant execute on function private.can_spend_unit(uuid, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 4b. Reaching the department through a unit
--
-- can_view_department recognised membership_departments and membership_brands.
-- With people now attached to units instead, a unit officer belonged to nothing
-- it knew about: they could not see their department, so not their brand, so
-- not their own unit. Everything above this line worked and the officer saw an
-- empty screen.
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
        or exists (
          select 1 from public.membership_units mu
          join public.units u on u.id = mu.unit_id
          join public.brands b on b.id = u.brand_id
          where mu.membership_id = m.id and b.department_id = p_department)
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
-- 5. A budget line asks the deepest thing it belongs to
-- -----------------------------------------------------------------------------

create or replace function private.can_view_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when bl.unit_id  is not null then private.can_view_unit(bl.org_id, bl.unit_id)
      when bl.brand_id is not null then private.can_view_brand(bl.org_id, bl.brand_id)
      else private.can_view_department(bl.org_id, bl.department_id)
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
      when bl.unit_id  is not null then private.can_edit_unit(bl.org_id, bl.unit_id)
      when bl.brand_id is not null then private.can_edit_brand(bl.org_id, bl.brand_id)
      else private.can_edit_department(bl.org_id, bl.department_id)
    end
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;

create or replace function private.can_spend_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when bl.unit_id  is not null then private.can_spend_unit(bl.org_id, bl.unit_id)
      when bl.brand_id is not null then private.can_spend_brand(bl.org_id, bl.brand_id)
      else private.can_edit_department(bl.org_id, bl.department_id)
    end
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;


-- ---------------- 0011_department_approval.sql ----------------

-- Department managers give final approval for their own department.
--
-- The brief is explicit about the chain:
--
--   Unit/Line Managers  "can send approvals to Department managers"
--   Department Managers "give final approval of all spending in a department"
--
-- The trigger said:
--
--   if new.status in ('approved', 'rejected')
--      and v_role not in ('owner', 'admin', 'finance') then
--     raise exception 'Only owners, admins and finance can approve or reject';
--
-- so a department manager could raise spend and then wait for head office to
-- approve it — the one thing their role exists to do, refused. Sending an
-- approval upward already worked, because submitting is just moving a
-- transaction to 'pending'; it was the receiving end that was missing.
--
-- Approval is now scoped the way viewing and editing already are: a department
-- manager approves what belongs to their departments, and nothing else. Owners,
-- admins and finance are unchanged and still approve anywhere.

create or replace function private.can_approve_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      /* Final approval for their own department, every unit and brand inside
         it. Deliberately the department, not the unit: a unit manager sends
         the request up precisely because the decision is not theirs. */
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = bl.department_id)
      else false
    end
    from public.budget_lines bl
    join public.memberships m
      on m.org_id = bl.org_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where bl.id = p_line
  ), false)
$$;

grant execute on function private.can_approve_line(uuid) to authenticated;



-- The trigger below is 0001's guard_transaction, verbatim, with that single
-- condition swapped. Taken from the original rather than retyped: a first
-- attempt at rewriting it from memory silently lost the closed-period check,
-- the org_id immutability check and the service-role bypass. A diff against
-- 0001 caught it. Nothing else here differs.

create or replace function private.guard_transaction()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_role        public.org_role;
  v_paid        numeric(18, 2);
  v_derived     public.txn_status;
  v_available   numeric;
  v_allow_over  boolean;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception 'org_id is immutable';
  end if;
  if v_uid is null then
    return new;  -- trusted server-side context
  end if;

  v_role := private.org_role(new.org_id);
  if v_role is null then
    raise exception 'Not a member of this organization' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.budget_lines bl
    join public.budget_periods bp on bp.id = bl.period_id
    where bl.id = new.budget_line_id and bp.status = 'closed') then
    raise exception 'Budget period is closed';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending') then
      raise exception 'New transactions must start as draft or pending';
    end if;
    if new.txn_type = 'adjustment' and v_role not in ('owner', 'admin', 'finance') then
      raise exception 'Only finance can record adjustments' using errcode = '42501';
    end if;
    new.created_by   := v_uid;
    new.submitted_at := case when new.status = 'pending' then now() end;
    new.over_budget  := false;
    new.approved_by  := null;  new.approved_at := null;
    new.rejected_by  := null;  new.rejected_at := null;  new.rejection_reason := null;
    new.voided_by    := null;  new.voided_at   := null;  new.void_reason      := null;
    return new;
  end if;

  -- UPDATE
  if old.status = 'voided' then
    raise exception 'Voided transactions cannot be changed';
  end if;
  if new.txn_code <> old.txn_code or new.created_by is distinct from old.created_by then
    raise exception 'txn_code and created_by are immutable';
  end if;
  if old.status not in ('draft', 'pending', 'rejected')
     and (new.budget_line_id, new.approved_amount, new.txn_type)
         is distinct from (old.budget_line_id, old.approved_amount, old.txn_type) then
    raise exception 'Amount and budget line are locked once approved; void and re-create instead';
  end if;

  -- System-managed columns are only changed by the transitions below.
  new.submitted_at := old.submitted_at;
  new.over_budget  := old.over_budget;
  new.approved_by  := old.approved_by;  new.approved_at := old.approved_at;
  new.rejected_by  := old.rejected_by;  new.rejected_at := old.rejected_at;
  new.voided_by    := old.voided_by;    new.voided_at   := old.voided_at;
  if new.status = old.status then
    new.rejection_reason := old.rejection_reason;
    new.void_reason      := old.void_reason;
    return new;
  end if;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  where p.transaction_id = new.id and p.voided_at is null;

  if old.status in ('approved', 'partially_paid', 'paid')
     and new.status in ('approved', 'partially_paid', 'paid') then
    v_derived := case
      when v_paid = 0 then 'approved'::public.txn_status
      when v_paid = old.approved_amount then 'paid'::public.txn_status
      else 'partially_paid'::public.txn_status
    end;
    if new.status <> v_derived then
      raise exception 'Payment status is derived from payments; record or void a payment instead';
    end if;
    return new;
  end if;

  if not (
       (old.status = 'draft'    and new.status in ('pending', 'voided'))
    or (old.status = 'pending'  and new.status in ('draft', 'approved', 'rejected', 'voided'))
    or (old.status = 'rejected' and new.status in ('draft', 'pending', 'voided'))
    or (old.status = 'approved' and new.status = 'voided')
  ) then
    raise exception 'Invalid status change from % to %', old.status, new.status;
  end if;

  /* The one change from 0001: who may decide, rather than which three roles.
     A department manager gives final approval for their own department, which
     is the role's whole purpose and was refused here. */
  if new.status in ('approved', 'rejected') and not private.can_approve_line(new.budget_line_id) then
    raise exception 'Only an approver, or the manager of this department, can approve or reject'
      using errcode = '42501';
  end if;

  case new.status
    when 'pending' then
      new.submitted_at := now();
    when 'draft' then
      new.submitted_at := null;
    when 'rejected' then
      new.rejected_by := v_uid;
      new.rejected_at := now();
    when 'voided' then
      if v_paid <> 0 then
        raise exception 'Void this transaction''s payments first, or record an adjustment';
      end if;
      if v_role not in ('owner', 'admin', 'finance')
         and not (old.status in ('draft', 'pending', 'rejected') and old.created_by = v_uid) then
        raise exception 'You can only void your own unapproved transactions' using errcode = '42501';
      end if;
      if coalesce(btrim(new.void_reason), '') = '' then
        raise exception 'A reason is required to void a transaction';
      end if;
      new.voided_by := v_uid;
      new.voided_at := now();
    when 'approved' then
      new.approved_by := v_uid;
      new.approved_at := now();
      if new.approved_amount > 0 then
        -- Serialise approvals and transfers on this line.
        perform 1 from public.budget_lines bl where bl.id = new.budget_line_id for update;
        v_available := private.line_available(new.budget_line_id);
        if new.approved_amount > v_available then
          select o.allow_over_budget into v_allow_over from public.organizations o where o.id = new.org_id;
          if not v_allow_over then
            raise exception 'Over budget: % available on this line, % requested', v_available, new.approved_amount;
          end if;
          if v_role not in ('owner', 'admin') then
            raise exception 'Over-budget approval requires an owner or admin' using errcode = '42501';
          end if;
          new.over_budget := true;
        end if;
      end if;
    else
      null;
  end case;
  return new;
end;
$$;


-- ---------------- 0012_units_under_departments.sql ----------------

-- A unit belongs to a department.
--
-- The brief, read plainly: "within Marketing, there are various units like
-- Creative Unit, Events, and Fearless Brand, Sosa Brand, Bigi Brand and Bakery
-- Brand." Six units in one department. "Brand" is part of four of those names,
-- not a level above them.
--
-- 0010 hung units off brands, which put a step between a department and its
-- units that the business does not use: picking a budget line meant choosing a
-- brand before a unit, and there was nothing to choose.
--
-- So units now hang off departments. The brand column stays, nullable, because
-- it costs nothing and an organisation that does group units under brands can
-- still say so — but nothing requires it, and no screen asks for it.

-- -----------------------------------------------------------------------------
-- 1. Point units at a department
-- -----------------------------------------------------------------------------

alter table public.units
  add column if not exists department_id uuid;

/* Existing units reach their department through the brand they were created
   under, so nothing has to be re-entered. */
update public.units u
set    department_id = b.department_id
from   public.brands b
where  u.brand_id = b.id and u.department_id is null;

alter table public.units
  alter column brand_id drop not null;

do $$
begin
  if exists (select 1 from public.units where department_id is null) then
    raise exception 'Some units have no department. Resolve before continuing.';
  end if;
end $$;

alter table public.units
  alter column department_id set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_department_id_org_id_fkey') then
    alter table public.units
      add constraint units_department_id_org_id_fkey
      foreign key (department_id, org_id) references public.departments (id, org_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'units_id_department_id_key') then
    alter table public.units add constraint units_id_department_id_key unique (id, department_id);
  end if;
end $$;

/* A unit's name is unique within its department now, not within a brand. */
alter table public.units drop constraint if exists units_brand_id_name_key;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_department_id_name_key') then
    alter table public.units add constraint units_department_id_name_key unique (department_id, name);
  end if;
end $$;

create index if not exists units_department_id_idx on public.units (department_id);


-- -----------------------------------------------------------------------------
-- 2. The rules follow the department
-- -----------------------------------------------------------------------------

-- Everyone in the department sees every unit in it — the brief says a unit
-- manager "can view other brands/unit within the department".
create or replace function private.can_view_unit(p_org uuid, p_unit uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_view_department(u.org_id, u.department_id)
    from public.units u where u.id = p_unit and u.org_id = p_org
  ), false)
$$;

create or replace function private.can_edit_unit(p_org uuid, p_unit uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = u.department_id)
      /* "Line managers can edit and make changes within an individual unit."
         Theirs, and no other — they may look at the rest and not touch it. */
      when m.role = 'line_manager' then exists (
        select 1 from public.membership_units mu
        where mu.membership_id = m.id and mu.unit_id = p_unit)
      else false
    end
    from public.units u
    join public.memberships m
      on m.org_id = u.org_id and m.user_id = (select auth.uid()) and m.status = 'active'
    where u.id = p_unit and u.org_id = p_org
  ), false)
$$;

-- "Officers ... can spend within their units, but they can't spend within
-- Sosa Budget." Closed is closed: the unit's own flag, or its brand's if it
-- has one.
create or replace function private.can_spend_unit(p_org uuid, p_unit uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = u.department_id)
      when m.role = 'line_manager' then exists (
        select 1 from public.membership_units mu
        where mu.membership_id = m.id and mu.unit_id = p_unit)
      when m.role = 'officer' then
        u.officers_can_spend
        and coalesce((select b.officers_can_spend from public.brands b where b.id = u.brand_id), true)
        and exists (
          select 1 from public.membership_units mu
          where mu.membership_id = m.id and mu.unit_id = p_unit)
      else false
    end
    from public.units u
    join public.memberships m
      on m.org_id = u.org_id and m.user_id = (select auth.uid()) and m.status = 'active'
    where u.id = p_unit and u.org_id = p_org
  ), false)
$$;


-- -----------------------------------------------------------------------------
-- 2b. Reaching the department from a unit
--
-- can_view_department found a person's units by joining through the brand
-- above them. With units hanging off departments directly that join matches
-- nothing, so a unit officer belonged to nothing it recognised and saw an empty
-- screen — the same failure 0010 fixed, reintroduced by moving the level.
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
      /* A unit manager or officer reaches their department through their
         units. The brief grants them the whole department to look at. */
      when m.role in ('line_manager', 'officer') then
        exists (
          select 1 from public.membership_departments md
          where md.membership_id = m.id and md.department_id = p_department)
        or exists (
          select 1 from public.membership_units mu
          join public.units u on u.id = mu.unit_id
          where mu.membership_id = m.id and u.department_id = p_department)
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
-- 3. A budget line is Department › Unit › Category
-- -----------------------------------------------------------------------------

/* The unit no longer has to agree with a brand, because a line need not have
   one. It must agree with the department. */
alter table public.budget_lines
  drop constraint if exists budget_lines_unit_id_brand_id_fkey;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'budget_lines_unit_id_department_id_fkey'
  ) then
    alter table public.budget_lines
      add constraint budget_lines_unit_id_department_id_fkey
      foreign key (unit_id, department_id) references public.units (id, department_id);
  end if;
end $$;


-- -----------------------------------------------------------------------------
-- 4. Units are visible and writable through their department
-- -----------------------------------------------------------------------------

drop policy if exists units_select on public.units;
create policy units_select on public.units for select to authenticated
  using (private.can_view_department(org_id, department_id));

drop policy if exists units_write on public.units;
create policy units_write on public.units for all to authenticated
  using (private.can_edit_department(org_id, department_id))
  with check (private.can_edit_department(org_id, department_id));


-- ---------------- 0013_personal_month_rollover.sql ----------------

-- A new month keeps your categories.
--
-- start_personal_budget seeded every new budget with the same four starter
-- lines:
--
--   p_lines text[] default array['Rent', 'Food', 'Transport', 'Savings']
--
-- which is right for a first budget and wrong for every one after it. Someone
-- who spent October building up School fees, Fuel, Data and Airtime opened
-- November and found those gone, replaced by four names they had already
-- deleted. The categories are the part of a budget that takes effort to get
-- right, and they were the part that did not survive the month.
--
-- So: a new period copies the names and the budgeted amounts from the most
-- recent earlier period of the same cadence, and falls back to the starters
-- only when there is no earlier one. Amounts carry because a monthly budget is
-- mostly the same every month — rent does not change because the page turned —
-- and a figure that is wrong is easier to correct than one that is missing.
--
-- Spending does not carry. Each period starts at zero against its own budget,
-- which is the whole point of keeping them separate.

create or replace function public.start_personal_budget(
  p_cadence  public.budget_cadence,
  p_start    date default current_date,
  p_currency char(3) default 'NGN',
  p_lines    text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_start  date;
  v_end    date;
  v_name   text;
  v_budget uuid;
  v_prev   uuid;
  v_line   text;
  v_pos    smallint := 0;
  v_copied integer := 0;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  if p_cadence = 'monthly' then
    v_start := date_trunc('month', p_start)::date;
    v_end   := (v_start + interval '1 month' - interval '1 day')::date;
    v_name  := to_char(v_start, 'FMMonth YYYY');
  else
    v_start := date_trunc('year', p_start)::date;
    v_end   := (v_start + interval '1 year' - interval '1 day')::date;
    v_name  := to_char(v_start, 'YYYY');
  end if;

  insert into public.personal_profiles (user_id, currency)
  values (v_user, p_currency)
  on conflict (user_id) do nothing;

  select id into v_budget
  from public.personal_budgets
  where user_id = v_user and cadence = p_cadence and start_date = v_start;
  if v_budget is not null then
    return v_budget;
  end if;

  insert into public.personal_budgets (user_id, name, cadence, start_date, end_date)
  values (v_user, v_name, p_cadence, v_start, v_end)
  returning id into v_budget;

  /* An explicit list wins — that is someone setting up deliberately. */
  if p_lines is not null then
    foreach v_line in array p_lines loop
      if length(trim(v_line)) > 0 then
        insert into public.personal_lines (budget_id, user_id, name, position)
        values (v_budget, v_user, trim(v_line), v_pos)
        on conflict do nothing;
        v_pos := v_pos + 1;
      end if;
    end loop;
    return v_budget;
  end if;

  /* Otherwise carry the last period forward. The nearest earlier one, not the
     newest overall: someone filling in a month they missed should inherit from
     the month before it, not from next year. */
  select id into v_prev
  from public.personal_budgets
  where user_id = v_user and cadence = p_cadence and start_date < v_start
  order by start_date desc
  limit 1;

  if v_prev is not null then
    insert into public.personal_lines (budget_id, user_id, name, planned, position)
    select v_budget, v_user, pl.name, pl.planned, pl.position
    from   public.personal_lines pl
    where  pl.budget_id = v_prev
    order  by pl.position;
    get diagnostics v_copied = row_count;
  end if;

  /* No earlier period, or an empty one, so this really is a first budget. */
  if v_copied = 0 then
    foreach v_line in array array['Rent', 'Food', 'Transport', 'Savings'] loop
      insert into public.personal_lines (budget_id, user_id, name, position)
      values (v_budget, v_user, v_line, v_pos)
      on conflict do nothing;
      v_pos := v_pos + 1;
    end loop;
  end if;

  return v_budget;
end $$;

grant execute on function public.start_personal_budget(public.budget_cadence, date, char(3), text[]) to authenticated;


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
select 'units table',
       case when to_regclass('public.units') is not null then 'OK' else 'MISSING' end
union all
select 'membership_units table',
       case when to_regclass('public.membership_units') is not null then 'OK' else 'MISSING' end
union all
select 'budget_lines.unit_id',
       case when exists (select 1 from information_schema.columns
         where table_schema='public' and table_name='budget_lines' and column_name='unit_id')
       then 'OK' else 'MISSING' end
union all
select 'department managers can approve',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'private' and p.proname = 'can_approve_line')
       then 'OK' else 'MISSING' end
union all
select 'spend rule wired to transactions',
       case when exists (select 1 from pg_policies
         where schemaname='public' and tablename='transactions'
           and policyname='transactions_insert' and with_check like '%can_spend_line%')
       then 'OK' else 'STILL ON can_edit_line' end;
