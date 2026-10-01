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
