-- ============================================================================
--  Rite Foods: Marketing, its brands, and their units.
--
--  From the brief: Marketing holds Creative Unit, Events, Fearless Brand, Sosa
--  Brand, Bigi Brand and Bakery Brand. Four of those are brands; Creative Unit
--  and Events are units, and the brief does not say which brand they sit under,
--  so they are created under every brand. Delete the ones that do not apply —
--  a unit with no budget line against it costs nothing.
--
--  Sosa is closed to officers, which is the rule as the business stated it.
--
--  Safe to re-run: every insert skips what is already there by name.
--  Change nothing else — it only adds.
-- ============================================================================

do $$
declare
  v_org   uuid;
  v_dept  uuid;
  v_brand uuid;
  b       text;
  u       text;
begin
  -- The organisation to set up. Edit this if the name differs.
  select id into v_org from public.organizations
  where name ilike 'Rite Foods%' order by created_at limit 1;

  if v_org is null then
    raise exception 'No organisation whose name starts with "Rite Foods". Edit the name in this script.';
  end if;

  -- Marketing
  select id into v_dept from public.departments
  where org_id = v_org and name ilike 'Marketing' limit 1;

  if v_dept is null then
    insert into public.departments (org_id, name, code)
    values (v_org, 'Marketing', 'MKT') returning id into v_dept;
  end if;

  -- The four brands. Sosa is the one closed to officers.
  foreach b in array array['Fearless Brand', 'Sosa Brand', 'Bigi Brand', 'Bakery Brand']
  loop
    select id into v_brand from public.brands
    where department_id = v_dept and name = b limit 1;

    if v_brand is null then
      insert into public.brands (org_id, department_id, name, officers_can_spend)
      values (v_org, v_dept, b, b <> 'Sosa Brand')
      returning id into v_brand;
    end if;

    -- The units named in the brief, under each brand.
    foreach u in array array['Creative Unit', 'Events']
    loop
      if not exists (select 1 from public.units where brand_id = v_brand and name = u) then
        insert into public.units (org_id, brand_id, name) values (v_org, v_brand, u);
      end if;
    end loop;
  end loop;
end $$;

-- ============================================================================
--  What now exists.
-- ============================================================================

select d.name  as department,
       b.name  as brand,
       u.name  as unit,
       case when b.officers_can_spend then 'open' else 'CLOSED to officers' end as brand_rule
from   public.departments d
join   public.brands b on b.department_id = d.id
left   join public.units u on u.brand_id = b.id
where  d.name ilike 'Marketing'
order  by b.name, u.name;
