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

create policy membership_brands_select on public.membership_brands for select to authenticated
  using (private.is_org_member(org_id));
create policy membership_brands_insert on public.membership_brands for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy membership_brands_delete on public.membership_brands for delete to authenticated
  using (private.is_org_admin(org_id));

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
