-- ============================================================================
--  Rite Foods: Marketing and its units.
--
--  Straight from the brief: "within Marketing, there are various units like
--  Creative Unit, Events, and Fearless Brand, Sosa Brand, Bigi Brand and
--  Bakery Brand." Six units in one department — "Brand" is part of four of
--  those names, not a level above them.
--
--  Sosa Brand is created closed to unit officers, which is the rule as the
--  business stated it: "they can't spend within Sosa Budget."
--
--  Safe to re-run: it skips anything already there by name, and only adds.
-- ============================================================================

do $$
declare
  v_org  uuid;
  v_dept uuid;
  u      text;
begin
  -- Edit this if the organisation is named differently.
  select id into v_org from public.organizations
  where name ilike 'Rite Foods%' order by created_at limit 1;

  if v_org is null then
    raise exception 'No organisation whose name starts with "Rite Foods". Edit the name in this script.';
  end if;

  select id into v_dept from public.departments
  where org_id = v_org and name ilike 'Marketing' limit 1;

  if v_dept is null then
    insert into public.departments (org_id, name, code)
    values (v_org, 'Marketing', 'MKT') returning id into v_dept;
  end if;

  foreach u in array array[
    'Creative Unit', 'Events', 'Fearless Brand', 'Sosa Brand', 'Bigi Brand', 'Bakery Brand'
  ]
  loop
    if not exists (select 1 from public.units where department_id = v_dept and name = u) then
      insert into public.units (org_id, department_id, name, officers_can_spend)
      values (v_org, v_dept, u, u <> 'Sosa Brand');
    end if;
  end loop;
end $$;

-- ============================================================================
--  What now exists.
-- ============================================================================

select d.name as department,
       u.name as unit,
       case when u.officers_can_spend then 'open'
            else 'CLOSED to unit officers' end as officer_rule
from   public.departments d
join   public.units u on u.department_id = d.id
where  d.name ilike 'Marketing'
order  by u.name;
