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
