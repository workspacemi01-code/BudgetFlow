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
