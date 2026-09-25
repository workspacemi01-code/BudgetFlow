-- =============================================================================
-- BudgetFlow — 0004_personal_budgets.sql
-- A budget for one person, with no company around it.
--
-- The business side of BudgetFlow answers "did this department have room in the
-- budget for this spend, and who approves it". A person budgeting their own
-- money has no department, no colleague to approve anything, and no annual
-- fiscal year — they have this month's rent, food and transport, and the
-- question "have I gone over".
--
-- So this is a separate set of tables rather than a personal-shaped
-- organization. Nothing above is touched: the business schema, its data and its
-- policies are exactly as they were, and a user can hold both kinds of account
-- at once without either knowing about the other.
--
-- The shape, smallest to largest:
--
--   personal_profiles   you have an individual account (and in what currency)
--   personal_budgets    one month, or one year
--   personal_lines      what you budget for inside it: Rent 200,000
--   personal_entries    what you actually spent, paid or still to pay
--
-- Ownership is a plain `user_id` on every table, so every policy is the same
-- one line and there is no membership graph to walk.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Types
-- -----------------------------------------------------------------------------

-- Monthly or yearly. Kept deliberately small: a person thinking in quarters is
-- rare enough that it is better added when someone asks than guessed at now.
create type public.budget_cadence as enum ('monthly', 'yearly');


-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------

-- Presence of a row here is what makes someone an individual user. It is not a
-- column on an existing table, because an individual has no organization to
-- hang it off, and sign-in has to be able to tell the two apart before it knows
-- anything else about them.
create table public.personal_profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  currency     char(3) not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.personal_profiles is
  'One row per individual account. Its existence is the account type.';

create table public.personal_budgets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  cadence    public.budget_cadence not null,
  start_date date not null,
  end_date   date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Lets the child tables key on (id, user_id), so a row can never be attached
  -- to a budget belonging to somebody else even if the id is guessed.
  unique (id, user_id),
  constraint personal_budgets_dates check (end_date >= start_date),
  -- One budget per person per period: "October 2026" twice is a mistake, not a
  -- feature, and silently allowing it splits the month's spending in two.
  unique (user_id, cadence, start_date)
);
create index personal_budgets_user_idx on public.personal_budgets (user_id, start_date desc);

-- What the money is set aside for: Rent, Food, Transport, Savings.
-- Called a "line" to match the business side's budget_lines, but there is no
-- department or category table behind it — an individual types the name.
create table public.personal_lines (
  id         uuid primary key default gen_random_uuid(),
  budget_id  uuid not null,
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  planned    numeric(14, 2) not null default 0 check (planned >= 0),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (budget_id, user_id) references public.personal_budgets (id, user_id) on delete cascade
);
-- Case-insensitive: "Food" and "food" in one budget are the same envelope, and
-- two of them means the totals stop adding up to what the person expects.
create unique index personal_lines_budget_name_key on public.personal_lines (budget_id, lower(name));
create index personal_lines_user_idx on public.personal_lines (user_id);

-- One actual expense.
--
-- `paid_at` null means "I know this is coming but I haven't paid it yet". That
-- split is the whole point of the pay button: money already gone and money
-- still owed both count against the budget, but only one of them has left the
-- account, and a person needs to see which.
create table public.personal_entries (
  id          uuid primary key default gen_random_uuid(),
  line_id     uuid not null,
  user_id     uuid not null references auth.users (id) on delete cascade,
  description text check (description is null or char_length(description) <= 140),
  amount      numeric(14, 2) not null check (amount > 0),
  spent_on    date not null default current_date,
  paid_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  foreign key (line_id, user_id) references public.personal_lines (id, user_id) on delete cascade
);
create index personal_entries_line_idx on public.personal_entries (line_id);
create index personal_entries_user_idx on public.personal_entries (user_id, spent_on desc);


-- -----------------------------------------------------------------------------
-- 3. Totals
-- -----------------------------------------------------------------------------

-- Every screen asks the same three questions of a line — how much is set aside,
-- how much has gone, how much is left — so they are answered once here rather
-- than in each query.
--
-- `remaining` is allowed to go negative on purpose. Clamping it at zero would
-- hide exactly the thing the person opened the app to find out.
create view public.v_personal_lines with (security_invoker = true) as
select
  l.id,
  l.budget_id,
  l.user_id,
  l.name,
  l.planned,
  l.position,
  coalesce(sum(e.amount) filter (where e.paid_at is not null), 0)::numeric(14, 2) as spent,
  coalesce(sum(e.amount) filter (where e.paid_at is null), 0)::numeric(14, 2)     as upcoming,
  coalesce(sum(e.amount), 0)::numeric(14, 2)                                      as committed,
  (l.planned - coalesce(sum(e.amount), 0))::numeric(14, 2)                        as remaining,
  count(e.id)                                                                     as entry_count
from public.personal_lines l
left join public.personal_entries e on e.line_id = l.id
group by l.id, l.budget_id, l.user_id, l.name, l.planned, l.position;

comment on view public.v_personal_lines is
  'Per-line totals. remaining goes negative when overspent — that is the signal, not an error.';


-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------

-- private.set_updated_at already exists (0001) and touches only new.updated_at,
-- so it is reused as-is. The audit trigger is deliberately NOT applied: it
-- writes an org_id, and these rows have no organization.
create trigger personal_profiles_updated_at before update on public.personal_profiles
  for each row execute function private.set_updated_at();
create trigger personal_budgets_updated_at before update on public.personal_budgets
  for each row execute function private.set_updated_at();
create trigger personal_lines_updated_at before update on public.personal_lines
  for each row execute function private.set_updated_at();
create trigger personal_entries_updated_at before update on public.personal_entries
  for each row execute function private.set_updated_at();


-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
--
-- One rule, four tables: the row is yours or it does not exist to you. The
-- `user_id` on the child tables is what makes this possible without a join —
-- and the composite foreign keys above are what stop that denormalised column
-- from ever disagreeing with the parent.

alter table public.personal_profiles enable row level security;
alter table public.personal_budgets  enable row level security;
alter table public.personal_lines    enable row level security;
alter table public.personal_entries  enable row level security;

create policy personal_profiles_select on public.personal_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy personal_profiles_insert on public.personal_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy personal_profiles_update on public.personal_profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy personal_budgets_select on public.personal_budgets for select to authenticated
  using (user_id = (select auth.uid()));
create policy personal_budgets_insert on public.personal_budgets for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy personal_budgets_update on public.personal_budgets for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy personal_budgets_delete on public.personal_budgets for delete to authenticated
  using (user_id = (select auth.uid()));

create policy personal_lines_select on public.personal_lines for select to authenticated
  using (user_id = (select auth.uid()));
create policy personal_lines_insert on public.personal_lines for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy personal_lines_update on public.personal_lines for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy personal_lines_delete on public.personal_lines for delete to authenticated
  using (user_id = (select auth.uid()));

create policy personal_entries_select on public.personal_entries for select to authenticated
  using (user_id = (select auth.uid()));
create policy personal_entries_insert on public.personal_entries for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy personal_entries_update on public.personal_entries for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy personal_entries_delete on public.personal_entries for delete to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- 6. Grants
-- -----------------------------------------------------------------------------
-- RLS above is what actually decides; these just open the tables to the role.

grant select, insert, update         on public.personal_profiles to authenticated;
grant select, insert, update, delete on public.personal_budgets  to authenticated;
grant select, insert, update, delete on public.personal_lines    to authenticated;
grant select, insert, update, delete on public.personal_entries  to authenticated;
grant select                         on public.v_personal_lines  to authenticated;

grant all on public.personal_profiles, public.personal_budgets,
             public.personal_lines,    public.personal_entries to service_role;
grant select on public.v_personal_lines to service_role;


-- -----------------------------------------------------------------------------
-- 7. Starting a budget
-- -----------------------------------------------------------------------------

-- Creates the period and its starting lines in one call, so a new individual
-- account lands on something filled in rather than an empty screen. Returns the
-- budget id.
--
-- security definer with a fixed search_path, matching create_organization.
create function public.start_personal_budget(
  p_cadence  public.budget_cadence,
  p_start    date default current_date,
  p_currency char(3) default 'NGN',
  p_lines    text[] default array['Rent', 'Food', 'Transport', 'Savings']
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
  v_line   text;
  v_pos    smallint := 0;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;

  -- Snap to the period the chosen date falls in, so two people who pick the
  -- 3rd and the 27th of the same month get the same October budget.
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

  -- Already have this month? Hand back the one that exists rather than failing
  -- — the caller is a person pressing a button, not a script.
  select id into v_budget
  from public.personal_budgets
  where user_id = v_user and cadence = p_cadence and start_date = v_start;
  if v_budget is not null then
    return v_budget;
  end if;

  insert into public.personal_budgets (user_id, name, cadence, start_date, end_date)
  values (v_user, v_name, p_cadence, v_start, v_end)
  returning id into v_budget;

  foreach v_line in array coalesce(p_lines, array[]::text[]) loop
    if length(trim(v_line)) > 0 then
      insert into public.personal_lines (budget_id, user_id, name, position)
      values (v_budget, v_user, trim(v_line), v_pos)
      on conflict do nothing;
      v_pos := v_pos + 1;
    end if;
  end loop;

  return v_budget;
end;
$$;

revoke all on function public.start_personal_budget(public.budget_cadence, date, char, text[]) from public;
grant execute on function public.start_personal_budget(public.budget_cadence, date, char, text[])
  to authenticated, service_role;
