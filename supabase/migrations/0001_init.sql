-- =============================================================================
-- BudgetFlow — 0001_init.sql
-- Multi-tenant budget planning & tracking schema for Supabase Postgres.
--
-- Rules this schema enforces (see docs/DECISIONS.md):
--   * Every tenant-owned row carries org_id and is isolated by RLS.
--   * Child rows reference parents by (id, org_id), so a row can never point
--     at another tenant's data.
--   * Spent / committed / available are always derived in views, never stored.
--   * Transactions and payments are never hard-deleted; they are voided.
--   * Every mutation is written to audit_logs by trigger.
--   * Workflow rules (approvals, over-budget, transfers) are enforced in the
--     database. Requests without a user JWT (service role, SQL editor, seed
--     scripts) are trusted and skip workflow checks.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Schemas & enums
-- -----------------------------------------------------------------------------

-- Internal helpers live outside the API-exposed `public` schema.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

create type public.org_role          as enum ('owner', 'admin', 'finance', 'dept_manager', 'viewer');
create type public.membership_status as enum ('pending', 'active', 'suspended');
create type public.period_status     as enum ('open', 'closed');
create type public.txn_type          as enum ('expense', 'adjustment');
create type public.txn_status        as enum ('draft', 'pending', 'approved', 'partially_paid', 'paid', 'rejected', 'voided');
create type public.transfer_status   as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.alert_channel     as enum ('email', 'slack', 'in_app');


-- -----------------------------------------------------------------------------
-- 1. Tenancy
-- -----------------------------------------------------------------------------

create table public.organizations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 120),
  slug              text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),
  plan              text not null default 'trial' check (plan in ('trial', 'starter', 'growth', 'enterprise')),
  trial_ends_at     timestamptz default (now() + interval '14 days'),
  currency          char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  fiscal_year_start smallint not null default 1 check (fiscal_year_start between 1 and 12),
  brand_label       text not null default 'Brand' check (char_length(brand_label) between 1 and 40),
  allow_over_budget boolean not null default false,
  industry          text,
  team_size         text,
  logo_url          text,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on column public.organizations.brand_label is 'Display name for the level-2 entity: Brand, Project, Cost Center…';
comment on column public.organizations.allow_over_budget is 'When true, owners/admins may approve transactions that exceed a line''s available budget.';

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  avatar_url text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  user_id       uuid references auth.users (id) on delete cascade,
  invited_email text check (invited_email is null or invited_email = lower(invited_email)),
  role          public.org_role not null default 'viewer',
  status        public.membership_status not null default 'pending',
  invited_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, user_id),
  check (user_id is not null or invited_email is not null),
  check (status = 'pending' or user_id is not null)
);
create unique index memberships_org_email_key on public.memberships (org_id, invited_email) where invited_email is not null;
create index memberships_user_id_idx on public.memberships (user_id);

-- Internal per-org counter for human-readable transaction codes (TXN-1001…).
create table private.txn_counters (
  org_id     uuid primary key references public.organizations (id) on delete cascade,
  next_value integer not null
);


-- -----------------------------------------------------------------------------
-- 2. Budget structure
-- -----------------------------------------------------------------------------

create table public.budget_periods (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  start_date date not null,
  end_date   date not null,
  status     public.period_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name),
  check (end_date > start_date)
);

create table public.departments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 120),
  code          text not null check (char_length(code) between 1 and 20),
  owner_user_id uuid references auth.users (id) on delete set null,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, code)
);
create index departments_owner_user_id_idx on public.departments (owner_user_id);

-- Links dept_manager / viewer memberships to the departments they may access.
create table public.membership_departments (
  membership_id uuid not null,
  department_id uuid not null,
  org_id        uuid not null references public.organizations (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (membership_id, department_id),
  foreign key (membership_id, org_id) references public.memberships (id, org_id) on delete cascade,
  foreign key (department_id, org_id) references public.departments (id, org_id) on delete cascade
);
create index membership_departments_department_id_idx on public.membership_departments (department_id);
create index membership_departments_org_id_idx on public.membership_departments (org_id);

-- A department's annual budget for one period (history is kept per period).
create table public.department_budgets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  department_id uuid not null,
  period_id     uuid not null,
  annual_budget numeric(18, 2) not null check (annual_budget >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (department_id, period_id),
  foreign key (department_id, org_id) references public.departments (id, org_id) on delete cascade,
  foreign key (period_id, org_id) references public.budget_periods (id, org_id) on delete cascade
);
create index department_budgets_org_id_idx on public.department_budgets (org_id);
create index department_budgets_period_id_idx on public.department_budgets (period_id);

create table public.brands (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  department_id uuid not null,
  name          text not null check (char_length(name) between 1 and 120),
  code          text check (char_length(code) between 1 and 20),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  unique (id, department_id),
  unique (department_id, name),
  foreign key (department_id, org_id) references public.departments (id, org_id) on delete cascade
);
create index brands_org_id_idx on public.brands (org_id);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  code        text check (char_length(code) between 1 and 20),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name)
);

-- The budget "bucket": period × department × (optional) brand × category.
create table public.budget_lines (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  period_id     uuid not null,
  department_id uuid not null,
  brand_id      uuid,
  category_id   uuid not null,
  annual_budget numeric(18, 2) not null check (annual_budget >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  unique nulls not distinct (period_id, department_id, brand_id, category_id),
  foreign key (period_id, org_id) references public.budget_periods (id, org_id),
  foreign key (department_id, org_id) references public.departments (id, org_id),
  foreign key (brand_id, department_id) references public.brands (id, department_id),
  foreign key (category_id, org_id) references public.categories (id, org_id)
);
create index budget_lines_org_id_idx on public.budget_lines (org_id);
create index budget_lines_department_id_idx on public.budget_lines (department_id, period_id);
create index budget_lines_brand_id_idx on public.budget_lines (brand_id);
create index budget_lines_category_id_idx on public.budget_lines (category_id);


-- -----------------------------------------------------------------------------
-- 3. Money movement
-- -----------------------------------------------------------------------------

create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  budget_line_id    uuid not null,
  txn_code          text not null,
  txn_type          public.txn_type not null default 'expense',
  txn_date          date not null default current_date,
  description       text not null check (char_length(description) between 1 and 500),
  vendor            text,
  reference         text,
  receipt_path      text,
  approved_amount   numeric(18, 2) not null check (approved_amount <> 0),
  status            public.txn_status not null default 'draft',
  over_budget       boolean not null default false,
  adjustment_reason text,
  created_by        uuid references auth.users (id) on delete set null,
  submitted_at      timestamptz,
  approved_by       uuid references auth.users (id) on delete set null,
  approved_at       timestamptz,
  rejected_by       uuid references auth.users (id) on delete set null,
  rejected_at       timestamptz,
  rejection_reason  text,
  voided_by         uuid references auth.users (id) on delete set null,
  voided_at         timestamptz,
  void_reason       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, txn_code),
  foreign key (budget_line_id, org_id) references public.budget_lines (id, org_id),
  check (txn_type = 'adjustment' or approved_amount > 0),
  check (txn_type = 'expense' or adjustment_reason is not null)
);
comment on column public.transactions.approved_amount is 'Requested amount; becomes committed on approval. Negative only for adjustments (reversals).';
comment on column public.transactions.receipt_path is 'Storage path in the receipts bucket: {org_id}/{transaction_id}/{filename}';
create index transactions_budget_line_id_idx on public.transactions (budget_line_id, status);
create index transactions_org_date_idx on public.transactions (org_id, txn_date);
create index transactions_org_status_idx on public.transactions (org_id, status);
create index transactions_created_by_idx on public.transactions (created_by);

-- Payments against an approved transaction. Spent = sum of non-voided payments.
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid not null,
  amount         numeric(18, 2) not null check (amount <> 0),
  paid_on        date not null default current_date,
  method         text,
  reference      text,
  created_by     uuid references auth.users (id) on delete set null,
  voided_by      uuid references auth.users (id) on delete set null,
  voided_at      timestamptz,
  void_reason    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (transaction_id, org_id) references public.transactions (id, org_id)
);
create index payments_transaction_id_idx on public.payments (transaction_id);
create index payments_org_id_idx on public.payments (org_id);

-- Moving budget between two lines of the same period. Takes effect on approval.
create table public.budget_transfers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  from_line_id  uuid not null,
  to_line_id    uuid not null,
  amount        numeric(18, 2) not null check (amount > 0),
  reason        text not null check (char_length(reason) between 1 and 500),
  status        public.transfer_status not null default 'pending',
  requested_by  uuid references auth.users (id) on delete set null,
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (from_line_id, org_id) references public.budget_lines (id, org_id),
  foreign key (to_line_id, org_id) references public.budget_lines (id, org_id),
  check (from_line_id <> to_line_id)
);
create index budget_transfers_from_line_id_idx on public.budget_transfers (from_line_id, status);
create index budget_transfers_to_line_id_idx on public.budget_transfers (to_line_id, status);
create index budget_transfers_org_status_idx on public.budget_transfers (org_id, status);


-- -----------------------------------------------------------------------------
-- 4. Collaboration, alerts, audit
-- -----------------------------------------------------------------------------

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  transaction_id uuid not null,
  user_id        uuid default auth.uid() references auth.users (id) on delete set null,
  body           text not null check (char_length(body) between 1 and 2000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (transaction_id, org_id) references public.transactions (id, org_id) on delete cascade
);
create index comments_transaction_id_idx on public.comments (transaction_id);
create index comments_org_id_idx on public.comments (org_id);
create index comments_user_id_idx on public.comments (user_id);

create table public.alerts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 120),
  metric            text not null default 'utilisation_pct' check (metric in ('utilisation_pct', 'available_amount')),
  threshold         numeric(18, 2) not null,
  department_id     uuid,
  budget_line_id    uuid,
  channel           public.alert_channel not null default 'email',
  recipients        text[] not null default '{}',
  active            boolean not null default true,
  last_triggered_at timestamptz,
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (department_id, org_id) references public.departments (id, org_id) on delete cascade,
  foreign key (budget_line_id, org_id) references public.budget_lines (id, org_id) on delete cascade
);
create index alerts_org_id_idx on public.alerts (org_id);
create index alerts_department_id_idx on public.alerts (department_id);
create index alerts_budget_line_id_idx on public.alerts (budget_line_id);

-- No FK on org_id: audit history must outlive the rows (and orgs) it describes.
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  actor_id   uuid,
  entity     text not null,
  entity_id  uuid,
  action     text not null check (action in ('insert', 'update', 'delete')),
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (org_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);


-- -----------------------------------------------------------------------------
-- 5. Access helpers (used by RLS policies and triggers)
--    SECURITY DEFINER so they can read memberships without recursing into RLS.
-- -----------------------------------------------------------------------------

create function private.org_role(p_org uuid)
returns public.org_role
language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.org_id = p_org
    and m.user_id = (select auth.uid())
    and m.status = 'active'
$$;

create function private.is_org_member(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.org_role(p_org) is not null $$;

create function private.is_org_admin(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.org_role(p_org) in ('owner', 'admin'), false) $$;

create function private.is_approver(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(private.org_role(p_org) in ('owner', 'admin', 'finance'), false) $$;

create function private.has_pending_invite(p_org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = p_org
      and m.user_id is null
      and m.status = 'pending'
      and m.invited_email = lower((select auth.jwt()) ->> 'email')
  )
$$;

create function private.shares_org_with(p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.org_id = mine.org_id
    where mine.user_id = (select auth.uid()) and mine.status = 'active'
      and theirs.user_id = p_user
  )
$$;

-- Owners/admins/finance see every department. Dept managers see only assigned
-- departments. Viewers see everything unless they have assignments.
create function private.can_view_department(p_org uuid, p_department uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = p_department)
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

create function private.can_edit_department(p_org uuid, p_department uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = p_department)
      else false
    end
    from public.memberships m
    where m.org_id = p_org and m.user_id = (select auth.uid()) and m.status = 'active'
  ), false)
$$;

create function private.can_view_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_view_department(bl.org_id, bl.department_id)
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;

create function private.can_edit_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_edit_department(bl.org_id, bl.department_id)
    from public.budget_lines bl where bl.id = p_line
  ), false)
$$;

create function private.can_view_transaction(p_txn uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_view_line(t.budget_line_id)
    from public.transactions t where t.id = p_txn
  ), false)
$$;

create function private.can_edit_transaction(p_txn uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select private.can_edit_line(t.budget_line_id)
    from public.transactions t where t.id = p_txn
  ), false)
$$;

-- Receipt objects live at {org_id}/{transaction_id}/{filename}.
create function private.receipt_access(p_name text, p_write boolean)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_org   uuid;
  v_txn   uuid;
begin
  if coalesce(array_length(v_parts, 1), 0) < 3 then
    return false;
  end if;
  begin
    v_org := v_parts[1]::uuid;
    v_txn := v_parts[2]::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if not exists (select 1 from public.transactions t where t.id = v_txn and t.org_id = v_org) then
    return false;
  end if;
  return case when p_write then private.can_edit_transaction(v_txn)
              else private.can_view_transaction(v_txn) end;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. Derived views (always live; security_invoker so RLS applies to the caller)
-- -----------------------------------------------------------------------------

-- One row per transaction with its derived paid / spent / committed amounts.
create view public.v_transactions
with (security_invoker = true)
as
select
  t.id,
  t.org_id,
  t.txn_code,
  t.txn_type,
  t.txn_date,
  t.description,
  t.vendor,
  t.reference,
  t.receipt_path,
  t.status,
  t.over_budget,
  t.approved_amount,
  coalesce(p.paid, 0)::numeric(18, 2) as paid_amount,
  (case when t.status in ('approved', 'partially_paid', 'paid')
        then coalesce(p.paid, 0) else 0 end)::numeric(18, 2) as spent_amount,
  (case when t.status in ('approved', 'partially_paid')
        then t.approved_amount - coalesce(p.paid, 0) else 0 end)::numeric(18, 2) as committed_amount,
  t.budget_line_id,
  bl.period_id,
  bl.department_id,
  d.name  as department_name,
  bl.brand_id,
  b.name  as brand_name,
  bl.category_id,
  c.name  as category_name,
  t.adjustment_reason,
  t.created_by,
  t.submitted_at,
  t.approved_by,
  t.approved_at,
  t.rejected_by,
  t.rejected_at,
  t.rejection_reason,
  t.voided_by,
  t.voided_at,
  t.void_reason,
  t.created_at,
  t.updated_at
from public.transactions t
join public.budget_lines bl on bl.id = t.budget_line_id
join public.departments d   on d.id = bl.department_id
join public.categories c    on c.id = bl.category_id
left join public.brands b   on b.id = bl.brand_id
left join (
  select transaction_id, sum(amount) as paid
  from public.payments
  where voided_at is null
  group by transaction_id
) p on p.transaction_id = t.id;

-- Per budget line ("bucket"): Available = Budget − Spent − Committed.
create view public.v_budget_line_totals
with (security_invoker = true)
as
with tx as (
  select
    budget_line_id,
    sum(spent_amount)     as spent,
    sum(committed_amount) as committed,
    count(*) filter (where status = 'pending')           as pending_count,
    sum(approved_amount) filter (where status = 'pending') as pending_amount
  from public.v_transactions
  group by budget_line_id
),
xfer as (
  select line_id, sum(amount_in) as transfers_in, sum(amount_out) as transfers_out
  from (
    select to_line_id as line_id, amount as amount_in, 0 as amount_out
    from public.budget_transfers where status = 'approved'
    union all
    select from_line_id, 0, amount
    from public.budget_transfers where status = 'approved'
  ) moves
  group by line_id
)
select
  bl.id  as budget_line_id,
  bl.org_id,
  bl.period_id,
  bp.name as period_name,
  bl.department_id,
  d.name  as department_name,
  bl.brand_id,
  b.name  as brand_name,
  bl.category_id,
  c.name  as category_name,
  bl.annual_budget,
  coalesce(x.transfers_in, 0)::numeric(18, 2)  as transfers_in,
  coalesce(x.transfers_out, 0)::numeric(18, 2) as transfers_out,
  calc.effective_budget,
  calc.spent,
  calc.committed,
  (calc.effective_budget - calc.spent - calc.committed)::numeric(18, 2) as available,
  case when calc.effective_budget > 0
       then round((calc.spent + calc.committed) / calc.effective_budget * 100, 2)
  end as utilisation_pct,
  coalesce(tx.pending_count, 0)  as pending_count,
  coalesce(tx.pending_amount, 0)::numeric(18, 2) as pending_amount
from public.budget_lines bl
join public.budget_periods bp on bp.id = bl.period_id
join public.departments d     on d.id = bl.department_id
join public.categories c      on c.id = bl.category_id
left join public.brands b     on b.id = bl.brand_id
left join tx                  on tx.budget_line_id = bl.id
left join xfer x              on x.line_id = bl.id
cross join lateral (
  select
    (bl.annual_budget + coalesce(x.transfers_in, 0) - coalesce(x.transfers_out, 0))::numeric(18, 2) as effective_budget,
    coalesce(tx.spent, 0)::numeric(18, 2)     as spent,
    coalesce(tx.committed, 0)::numeric(18, 2) as committed
) calc;

-- Per department per period ("Dashboard Summary").
-- budget = department budget (or sum of lines if none set) + net transfers in.
create view public.v_department_summary
with (security_invoker = true)
as
with lines as (
  select
    department_id,
    period_id,
    sum(annual_budget)                 as allocated,
    sum(transfers_in - transfers_out)  as net_transfers,
    sum(spent)                         as spent,
    sum(committed)                     as committed,
    count(*)                           as line_count
  from public.v_budget_line_totals
  group by department_id, period_id
)
select
  d.org_id,
  bp.id   as period_id,
  bp.name as period_name,
  d.id    as department_id,
  d.name  as department_name,
  d.code  as department_code,
  db.annual_budget as department_budget,
  coalesce(l.allocated, 0)::numeric(18, 2) as allocated,
  (coalesce(db.annual_budget, l.allocated, 0) - coalesce(l.allocated, 0))::numeric(18, 2) as unallocated,
  calc.budget,
  calc.spent,
  calc.committed,
  (calc.budget - calc.spent - calc.committed)::numeric(18, 2) as available,
  case when calc.budget > 0
       then round((calc.spent + calc.committed) / calc.budget * 100, 2)
  end as utilisation_pct,
  coalesce(l.line_count, 0) as line_count
from public.departments d
join public.budget_periods bp          on bp.org_id = d.org_id
left join public.department_budgets db on db.department_id = d.id and db.period_id = bp.id
left join lines l                      on l.department_id = d.id and l.period_id = bp.id
cross join lateral (
  select
    (coalesce(db.annual_budget, l.allocated, 0) + coalesce(l.net_transfers, 0))::numeric(18, 2) as budget,
    coalesce(l.spent, 0)::numeric(18, 2)     as spent,
    coalesce(l.committed, 0)::numeric(18, 2) as committed
) calc
where db.id is not null or l.department_id is not null;

-- Per department per month ("Monthly Summary"). Sum across departments for org totals.
create view public.v_monthly_summary
with (security_invoker = true)
as
select
  t.org_id,
  t.period_id,
  t.department_id,
  t.department_name,
  date_trunc('month', t.txn_date)::date as month,
  count(*)                                   as transaction_count,
  count(*) filter (where t.status = 'pending') as pending_count,
  coalesce(sum(t.approved_amount) filter (where t.status in ('approved', 'partially_paid', 'paid')), 0)::numeric(18, 2) as approved,
  sum(t.spent_amount)::numeric(18, 2)     as spent,
  sum(t.committed_amount)::numeric(18, 2) as committed
from public.v_transactions t
where t.status not in ('draft', 'rejected', 'voided')
group by t.org_id, t.period_id, t.department_id, t.department_name, date_trunc('month', t.txn_date);

-- Available budget on a line, computed with full visibility (for trigger checks).
create function private.line_available(p_line uuid)
returns numeric
language sql stable security definer set search_path = ''
as $$
  select available from public.v_budget_line_totals where budget_line_id = p_line
$$;


-- -----------------------------------------------------------------------------
-- 7. Trigger functions
-- -----------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Keeps public.profiles in sync with auth.users.
create function private.handle_auth_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.profiles (id, email, full_name, avatar_url)
    values (
      new.id,
      new.email,
      coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
      coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
    )
    on conflict (id) do nothing;
  elsif new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

-- Generic audit writer. Skips no-op updates (only updated_at changed).
create function private.audit_row()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - 'updated_at') = (to_jsonb(new) - 'updated_at') then
    return null;
  end if;
  insert into public.audit_logs (org_id, actor_id, entity, entity_id, action, before, after)
  values (
    coalesce((v_row ->> 'org_id')::uuid, (v_row ->> 'id')::uuid),  -- organizations use id
    auth.uid(),
    tg_table_name,
    (v_row ->> 'id')::uuid,
    lower(tg_op),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

-- Billing-managed columns can only be changed by the service role.
create function private.guard_organization()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if auth.uid() is not null
     and (new.plan, new.trial_ends_at, new.created_by)
         is distinct from (old.plan, old.trial_ends_at, old.created_by) then
    raise exception 'plan, trial_ends_at and created_by are managed by billing'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.guard_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.org_role;
begin
  if v_uid is null then
    return coalesce(new, old);
  end if;
  v_role := private.org_role(coalesce(new.org_id, old.org_id));

  if tg_op = 'INSERT' then
    -- Founder: the org creator's first (owner) membership.
    if new.user_id = v_uid and new.role = 'owner' and new.status = 'active'
       and exists (select 1 from public.organizations o where o.id = new.org_id and o.created_by = v_uid)
       and not exists (select 1 from public.memberships m where m.org_id = new.org_id) then
      return new;
    end if;
    if not coalesce(v_role in ('owner', 'admin'), false) then
      raise exception 'Only owners and admins can invite members' using errcode = '42501';
    end if;
    if new.invited_email is null or btrim(new.invited_email) = '' then
      raise exception 'invited_email is required';
    end if;
    if new.role = 'owner' and v_role <> 'owner' then
      raise exception 'Only owners can invite owners' using errcode = '42501';
    end if;
    new.invited_email := lower(btrim(new.invited_email));
    new.user_id       := null;
    new.status        := 'pending';
    new.invited_by    := v_uid;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Invitee accepting their own invitation.
    if old.user_id is null and new.user_id = v_uid then
      if old.status <> 'pending' or new.status <> 'active'
         or old.invited_email is distinct from lower((select auth.jwt()) ->> 'email')
         or (new.org_id, new.role, new.invited_email, new.invited_by)
            is distinct from (old.org_id, old.role, old.invited_email, old.invited_by) then
        raise exception 'Invalid invitation acceptance' using errcode = '42501';
      end if;
      return new;
    end if;
    if not coalesce(v_role in ('owner', 'admin'), false) then
      raise exception 'Only owners and admins can change memberships' using errcode = '42501';
    end if;
    if (new.org_id, new.user_id, new.invited_email, new.invited_by)
       is distinct from (old.org_id, old.user_id, old.invited_email, old.invited_by) then
      raise exception 'org, user and invitation fields are immutable';
    end if;
    if v_role = 'admin' and (old.role = 'owner' or new.role = 'owner') then
      raise exception 'Only owners can change owner memberships' using errcode = '42501';
    end if;
    if old.user_id = v_uid and new.role <> old.role then
      raise exception 'You cannot change your own role';
    end if;
    if old.status = 'pending' and new.status <> 'pending' then
      raise exception 'Pending invitations are activated by the invitee';
    end if;
    return new;
  end if;

  -- DELETE: members may leave; owners/admins may remove others.
  if old.user_id = v_uid
     or (old.user_id is null and old.invited_email = lower((select auth.jwt()) ->> 'email')) then
    return old;
  end if;
  if not coalesce(v_role in ('owner', 'admin'), false) then
    raise exception 'Only owners and admins can remove members' using errcode = '42501';
  end if;
  if v_role = 'admin' and old.role = 'owner' then
    raise exception 'Only owners can remove owners' using errcode = '42501';
  end if;
  return old;
end;
$$;

create function private.ensure_org_has_owner()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and exists (select 1 from public.organizations o where o.id = old.org_id)
     and not exists (
       select 1 from public.memberships m
       where m.org_id = old.org_id and m.role = 'owner' and m.status = 'active') then
    raise exception 'An organization must keep at least one active owner';
  end if;
  return null;
end;
$$;

create function private.guard_budget_line()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.org_role;
  v_cap       numeric;
  v_allocated numeric;
  v_available numeric;
begin
  if tg_op = 'UPDATE'
     and (new.org_id, new.period_id, new.department_id, new.brand_id, new.category_id)
         is distinct from (old.org_id, old.period_id, old.department_id, old.brand_id, old.category_id)
     and (exists (select 1 from public.transactions t where t.budget_line_id = old.id)
          or exists (select 1 from public.budget_transfers bt
                     where old.id in (bt.from_line_id, bt.to_line_id))) then
    raise exception 'This budget line has activity; create a new line instead of moving it';
  end if;

  if v_uid is null then
    return new;
  end if;
  v_role := private.org_role(new.org_id);

  if exists (select 1 from public.budget_periods bp where bp.id = new.period_id and bp.status = 'closed') then
    raise exception 'Budget period is closed';
  end if;

  -- Dept managers may only re-allocate within their department's budget.
  if v_role = 'dept_manager' then
    select db.annual_budget into v_cap
    from public.department_budgets db
    where db.department_id = new.department_id and db.period_id = new.period_id;
    if v_cap is null then
      raise exception 'The department budget for this period is not set yet; ask Finance';
    end if;
    select coalesce(sum(bl.annual_budget), 0) into v_allocated
    from public.budget_lines bl
    where bl.department_id = new.department_id and bl.period_id = new.period_id and bl.id <> new.id;
    if v_allocated + new.annual_budget > v_cap then
      raise exception 'Allocation exceeds the department budget (% of % already allocated)', v_allocated, v_cap;
    end if;
  end if;

  -- A line's budget cannot drop below what is already spent + committed.
  if tg_op = 'UPDATE' and new.annual_budget < old.annual_budget then
    v_available := private.line_available(old.id);
    if v_available - (old.annual_budget - new.annual_budget) < 0 then
      raise exception 'Budget cannot be reduced below spent + committed (only % can be removed)', v_available;
    end if;
  end if;
  return new;
end;
$$;

create function private.set_txn_code()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_num integer;
begin
  if new.txn_code is not null and btrim(new.txn_code) <> '' then
    return new;
  end if;
  loop
    insert into private.txn_counters as c (org_id, next_value)
    values (new.org_id, 1002)
    on conflict (org_id) do update set next_value = c.next_value + 1
    returning c.next_value - 1 into v_num;
    new.txn_code := 'TXN-' || v_num;
    exit when not exists (
      select 1 from public.transactions t where t.org_id = new.org_id and t.txn_code = new.txn_code);
  end loop;
  return new;
end;
$$;

-- Transaction workflow:
--   draft → pending → approved → partially_paid → paid
--                  ↘ rejected → draft / pending
--   draft / pending / rejected / approved (no payments) → voided
-- approved / partially_paid / paid are derived from payments, never set by hand.
create function private.guard_transaction()
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

  if new.status in ('approved', 'rejected') and v_role not in ('owner', 'admin', 'finance') then
    raise exception 'Only owners, admins and finance can approve or reject' using errcode = '42501';
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

create function private.guard_payment()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_txn public.transactions;
begin
  if tg_op = 'UPDATE' then
    if (new.org_id, new.transaction_id, new.amount, new.paid_on, new.created_by)
       is distinct from (old.org_id, old.transaction_id, old.amount, old.paid_on, old.created_by) then
      raise exception 'Payments cannot be edited; void and re-record instead';
    end if;
    if old.voided_at is not null then
      raise exception 'This payment is already voided';
    end if;
    if new.voided_at is not null and v_uid is not null then
      if coalesce(btrim(new.void_reason), '') = '' then
        raise exception 'A reason is required to void a payment';
      end if;
      new.voided_by := v_uid;
      new.voided_at := now();
    end if;
    return new;
  end if;

  select * into v_txn from public.transactions t where t.id = new.transaction_id for update;
  if v_txn.status not in ('approved', 'partially_paid') then
    raise exception 'Only approved transactions can be paid (status is %)', v_txn.status;
  end if;
  if sign(new.amount) <> sign(v_txn.approved_amount) then
    raise exception 'Payment amount must have the same sign as the transaction amount';
  end if;
  if v_uid is not null then
    new.created_by := v_uid;
    new.voided_by := null;
    new.voided_at := null;
    new.void_reason := null;
  end if;
  return new;
end;
$$;

-- After a payment changes, re-derive the transaction's payment status.
create function private.sync_payment_status()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_txn    public.transactions;
  v_paid   numeric(18, 2);
  v_status public.txn_status;
begin
  select * into v_txn from public.transactions t where t.id = new.transaction_id for update;
  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  where p.transaction_id = new.transaction_id and p.voided_at is null;

  if abs(v_paid) > abs(v_txn.approved_amount) then
    raise exception 'Payments (%) would exceed the approved amount (%)', v_paid, v_txn.approved_amount;
  end if;
  v_status := case
    when v_paid = 0 then 'approved'::public.txn_status
    when v_paid = v_txn.approved_amount then 'paid'::public.txn_status
    else 'partially_paid'::public.txn_status
  end;
  if v_txn.status <> v_status then
    update public.transactions set status = v_status where id = v_txn.id;
  end if;
  return null;
end;
$$;

create function private.guard_budget_transfer()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_role      public.org_role;
  v_available numeric;
begin
  if tg_op = 'INSERT' then
    if (select period_id from public.budget_lines where id = new.from_line_id)
       is distinct from (select period_id from public.budget_lines where id = new.to_line_id) then
      raise exception 'Transfers must stay within one budget period';
    end if;
    if v_uid is null then
      return new;
    end if;
    if new.status <> 'pending' then
      raise exception 'New transfers must start as pending';
    end if;
    new.requested_by := v_uid;
    new.decided_by   := null;
    new.decided_at   := null;
    return new;
  end if;

  -- UPDATE
  if (new.org_id, new.from_line_id, new.to_line_id, new.amount, new.reason, new.requested_by)
     is distinct from (old.org_id, old.from_line_id, old.to_line_id, old.amount, old.reason, old.requested_by) then
    raise exception 'Transfers cannot be edited; cancel and create a new one';
  end if;
  if new.status = old.status then
    return new;
  end if;
  if old.status <> 'pending' then
    raise exception 'This transfer is already %', old.status;
  end if;

  if v_uid is not null then
    v_role := private.org_role(new.org_id);
    if v_role is null then
      raise exception 'Not a member of this organization' using errcode = '42501';
    end if;
    if new.status in ('approved', 'rejected') and v_role not in ('owner', 'admin', 'finance') then
      raise exception 'Only owners, admins and finance can decide transfers' using errcode = '42501';
    end if;
    if new.status = 'cancelled' and v_role not in ('owner', 'admin', 'finance')
       and old.requested_by is distinct from v_uid then
      raise exception 'Only the requester or finance can cancel a transfer' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.budget_lines bl
      join public.budget_periods bp on bp.id = bl.period_id
      where bl.id = new.from_line_id and bp.status = 'closed') then
      raise exception 'Budget period is closed';
    end if;
    new.decided_by := v_uid;
    new.decided_at := now();
  end if;

  if new.status = 'approved' then
    perform 1 from public.budget_lines bl
    where bl.id in (new.from_line_id, new.to_line_id)
    order by bl.id
    for update;
    v_available := private.line_available(new.from_line_id);
    if new.amount > v_available then
      raise exception 'Only % is available on the source line', v_available;
    end if;
  end if;
  return new;
end;
$$;


-- -----------------------------------------------------------------------------
-- 8. Triggers
-- -----------------------------------------------------------------------------

-- updated_at on every mutable table
create trigger organizations_updated_at      before update on public.organizations      for each row execute function private.set_updated_at();
create trigger profiles_updated_at           before update on public.profiles           for each row execute function private.set_updated_at();
create trigger memberships_updated_at        before update on public.memberships        for each row execute function private.set_updated_at();
create trigger budget_periods_updated_at     before update on public.budget_periods     for each row execute function private.set_updated_at();
create trigger departments_updated_at        before update on public.departments        for each row execute function private.set_updated_at();
create trigger department_budgets_updated_at before update on public.department_budgets for each row execute function private.set_updated_at();
create trigger brands_updated_at             before update on public.brands             for each row execute function private.set_updated_at();
create trigger categories_updated_at         before update on public.categories         for each row execute function private.set_updated_at();
create trigger budget_lines_updated_at       before update on public.budget_lines       for each row execute function private.set_updated_at();
create trigger transactions_updated_at       before update on public.transactions       for each row execute function private.set_updated_at();
create trigger payments_updated_at           before update on public.payments           for each row execute function private.set_updated_at();
create trigger budget_transfers_updated_at   before update on public.budget_transfers   for each row execute function private.set_updated_at();
create trigger comments_updated_at           before update on public.comments           for each row execute function private.set_updated_at();
create trigger alerts_updated_at             before update on public.alerts             for each row execute function private.set_updated_at();

-- auth.users → profiles
create trigger on_auth_user_changed
  after insert or update of email on auth.users
  for each row execute function private.handle_auth_user();

-- workflow guards
create trigger organizations_guard     before update on public.organizations for each row execute function private.guard_organization();
create trigger memberships_guard       before insert or update or delete on public.memberships for each row execute function private.guard_membership();
create trigger memberships_owner_check after update or delete on public.memberships for each row execute function private.ensure_org_has_owner();
create trigger budget_lines_guard      before insert or update on public.budget_lines for each row execute function private.guard_budget_line();
create trigger transactions_10_guard   before insert or update on public.transactions for each row execute function private.guard_transaction();
create trigger transactions_20_code    before insert on public.transactions for each row execute function private.set_txn_code();
create trigger payments_guard          before insert or update on public.payments for each row execute function private.guard_payment();
create trigger payments_sync_status    after insert or update on public.payments for each row execute function private.sync_payment_status();
create trigger budget_transfers_guard  before insert or update on public.budget_transfers for each row execute function private.guard_budget_transfer();

-- audit log (organizations: no delete audit, the org row is gone with its data)
create trigger organizations_audit          after insert or update on public.organizations                    for each row execute function private.audit_row();
create trigger memberships_audit            after insert or update or delete on public.memberships            for each row execute function private.audit_row();
create trigger membership_departments_audit after insert or update or delete on public.membership_departments for each row execute function private.audit_row();
create trigger budget_periods_audit         after insert or update or delete on public.budget_periods         for each row execute function private.audit_row();
create trigger departments_audit            after insert or update or delete on public.departments            for each row execute function private.audit_row();
create trigger department_budgets_audit     after insert or update or delete on public.department_budgets     for each row execute function private.audit_row();
create trigger brands_audit                 after insert or update or delete on public.brands                 for each row execute function private.audit_row();
create trigger categories_audit             after insert or update or delete on public.categories             for each row execute function private.audit_row();
create trigger budget_lines_audit           after insert or update or delete on public.budget_lines           for each row execute function private.audit_row();
create trigger transactions_audit           after insert or update or delete on public.transactions           for each row execute function private.audit_row();
create trigger payments_audit               after insert or update or delete on public.payments               for each row execute function private.audit_row();
create trigger budget_transfers_audit       after insert or update or delete on public.budget_transfers       for each row execute function private.audit_row();
create trigger comments_audit               after insert or update or delete on public.comments               for each row execute function private.audit_row();
create trigger alerts_audit                 after insert or update or delete on public.alerts                 for each row execute function private.audit_row();


-- -----------------------------------------------------------------------------
-- 9. RPCs (called from the app via supabase.rpc)
-- -----------------------------------------------------------------------------

-- Creates an org, makes the caller its owner and opens the current fiscal year.
create function public.create_organization(
  p_name              text,
  p_slug              text,
  p_currency          text default 'USD',
  p_fiscal_year_start integer default 1,
  p_industry          text default null,
  p_team_size         text default null
)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_org   public.organizations;
  v_year  integer;
  v_start date;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, currency, fiscal_year_start, industry, team_size, created_by)
  values (btrim(p_name), lower(btrim(p_slug)), upper(p_currency), p_fiscal_year_start, p_industry, p_team_size, v_uid)
  returning * into v_org;

  insert into public.memberships (org_id, user_id, role, status, invited_by)
  values (v_org.id, v_uid, 'owner', 'active', v_uid);

  v_year := extract(year from current_date)::integer;
  if extract(month from current_date)::integer < p_fiscal_year_start then
    v_year := v_year - 1;
  end if;
  v_start := make_date(v_year, p_fiscal_year_start, 1);

  insert into public.budget_periods (org_id, name, start_date, end_date)
  values (
    v_org.id,
    case when p_fiscal_year_start = 1 then 'FY' || v_year
         else 'FY' || v_year || '/' || right((v_year + 1)::text, 2) end,
    v_start,
    (v_start + interval '1 year' - interval '1 day')::date
  );
  return v_org;
end;
$$;

-- Accepts a pending invitation addressed to the caller's email.
create function public.accept_invitation(p_membership_id uuid)
returns public.memberships
language plpgsql security invoker set search_path = ''
as $$
declare
  v_membership public.memberships;
begin
  update public.memberships
  set user_id = auth.uid(), status = 'active'
  where id = p_membership_id and user_id is null and status = 'pending'
  returning * into v_membership;
  if v_membership.id is null then
    raise exception 'Invitation not found or already used';
  end if;
  return v_membership;
end;
$$;


-- -----------------------------------------------------------------------------
-- 10. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.organizations          enable row level security;
alter table public.profiles               enable row level security;
alter table public.memberships            enable row level security;
alter table public.membership_departments enable row level security;
alter table public.budget_periods         enable row level security;
alter table public.departments            enable row level security;
alter table public.department_budgets     enable row level security;
alter table public.brands                 enable row level security;
alter table public.categories             enable row level security;
alter table public.budget_lines           enable row level security;
alter table public.transactions           enable row level security;
alter table public.payments               enable row level security;
alter table public.budget_transfers       enable row level security;
alter table public.comments               enable row level security;
alter table public.alerts                 enable row level security;
alter table public.audit_logs             enable row level security;

-- organizations (created via create_organization RPC; never deleted from the API)
create policy organizations_select on public.organizations for select to authenticated
  using (private.is_org_member(id) or private.has_pending_invite(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- memberships
create policy memberships_select on public.memberships for select to authenticated
  using (
    private.is_org_member(org_id)
    or user_id = (select auth.uid())
    or (user_id is null and invited_email = lower((select auth.jwt()) ->> 'email'))
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy memberships_update on public.memberships for update to authenticated
  using (
    private.is_org_admin(org_id)
    or (user_id is null and invited_email = lower((select auth.jwt()) ->> 'email'))
  )
  with check (private.is_org_admin(org_id) or user_id = (select auth.uid()));
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    private.is_org_admin(org_id)
    or user_id = (select auth.uid())
    or (user_id is null and invited_email = lower((select auth.jwt()) ->> 'email'))
  );

-- membership_departments
create policy membership_departments_select on public.membership_departments for select to authenticated
  using (private.is_org_member(org_id));
create policy membership_departments_insert on public.membership_departments for insert to authenticated
  with check (private.is_org_admin(org_id));
create policy membership_departments_delete on public.membership_departments for delete to authenticated
  using (private.is_org_admin(org_id));

-- budget_periods
create policy budget_periods_select on public.budget_periods for select to authenticated
  using (private.is_org_member(org_id));
create policy budget_periods_insert on public.budget_periods for insert to authenticated
  with check (private.is_approver(org_id));
create policy budget_periods_update on public.budget_periods for update to authenticated
  using (private.is_approver(org_id)) with check (private.is_approver(org_id));
create policy budget_periods_delete on public.budget_periods for delete to authenticated
  using (private.is_approver(org_id));

-- departments
create policy departments_select on public.departments for select to authenticated
  using (private.can_view_department(org_id, id));
create policy departments_insert on public.departments for insert to authenticated
  with check (private.is_approver(org_id));
create policy departments_update on public.departments for update to authenticated
  using (private.is_approver(org_id)) with check (private.is_approver(org_id));
create policy departments_delete on public.departments for delete to authenticated
  using (private.is_approver(org_id));

-- department_budgets
create policy department_budgets_select on public.department_budgets for select to authenticated
  using (private.can_view_department(org_id, department_id));
create policy department_budgets_insert on public.department_budgets for insert to authenticated
  with check (private.is_approver(org_id));
create policy department_budgets_update on public.department_budgets for update to authenticated
  using (private.is_approver(org_id)) with check (private.is_approver(org_id));
create policy department_budgets_delete on public.department_budgets for delete to authenticated
  using (private.is_approver(org_id));

-- brands
create policy brands_select on public.brands for select to authenticated
  using (private.can_view_department(org_id, department_id));
create policy brands_insert on public.brands for insert to authenticated
  with check (private.can_edit_department(org_id, department_id));
create policy brands_update on public.brands for update to authenticated
  using (private.can_edit_department(org_id, department_id))
  with check (private.can_edit_department(org_id, department_id));
create policy brands_delete on public.brands for delete to authenticated
  using (private.can_edit_department(org_id, department_id));

-- categories
create policy categories_select on public.categories for select to authenticated
  using (private.is_org_member(org_id));
create policy categories_insert on public.categories for insert to authenticated
  with check (private.is_approver(org_id));
create policy categories_update on public.categories for update to authenticated
  using (private.is_approver(org_id)) with check (private.is_approver(org_id));
create policy categories_delete on public.categories for delete to authenticated
  using (private.is_approver(org_id));

-- budget_lines
create policy budget_lines_select on public.budget_lines for select to authenticated
  using (private.can_view_department(org_id, department_id));
create policy budget_lines_insert on public.budget_lines for insert to authenticated
  with check (private.can_edit_department(org_id, department_id));
create policy budget_lines_update on public.budget_lines for update to authenticated
  using (private.can_edit_department(org_id, department_id))
  with check (private.can_edit_department(org_id, department_id));
create policy budget_lines_delete on public.budget_lines for delete to authenticated
  using (private.is_approver(org_id));

-- transactions (no delete policy: transactions are voided, never deleted)
create policy transactions_select on public.transactions for select to authenticated
  using (private.can_view_line(budget_line_id));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (private.can_edit_line(budget_line_id));
create policy transactions_update on public.transactions for update to authenticated
  using (private.can_edit_line(budget_line_id))
  with check (private.can_edit_line(budget_line_id));

-- payments (no delete policy)
create policy payments_select on public.payments for select to authenticated
  using (private.can_view_transaction(transaction_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (private.is_approver(org_id));
create policy payments_update on public.payments for update to authenticated
  using (private.is_approver(org_id)) with check (private.is_approver(org_id));

-- budget_transfers (no delete policy)
create policy budget_transfers_select on public.budget_transfers for select to authenticated
  using (private.can_view_line(from_line_id) or private.can_view_line(to_line_id));
create policy budget_transfers_insert on public.budget_transfers for insert to authenticated
  with check (private.can_edit_line(from_line_id) and private.can_edit_line(to_line_id));
create policy budget_transfers_update on public.budget_transfers for update to authenticated
  using (private.is_approver(org_id) or requested_by = (select auth.uid()))
  with check (private.is_approver(org_id) or requested_by = (select auth.uid()));

-- comments
create policy comments_select on public.comments for select to authenticated
  using (private.can_view_transaction(transaction_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and private.can_view_transaction(transaction_id));
create policy comments_update on public.comments for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy comments_delete on public.comments for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_org_admin(org_id));

-- alerts
create policy alerts_select on public.alerts for select to authenticated
  using (private.is_org_member(org_id));
create policy alerts_insert on public.alerts for insert to authenticated
  with check (private.is_approver(org_id));
create policy alerts_update on public.alerts for update to authenticated
  using (private.is_approver(org_id)) with check (private.is_approver(org_id));
create policy alerts_delete on public.alerts for delete to authenticated
  using (private.is_approver(org_id));

-- audit_logs (read-only; written by trigger)
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (private.is_approver(org_id));


-- -----------------------------------------------------------------------------
-- 11. Storage: private receipts bucket ({org_id}/{transaction_id}/{filename})
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and private.receipt_access(name, false));
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and private.receipt_access(name, true));


-- -----------------------------------------------------------------------------
-- 12. Realtime (postgres_changes respects RLS)
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.transactions, public.payments, public.budget_transfers;
  end if;
end;
$$;


-- -----------------------------------------------------------------------------
-- 13. Grants
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_logs from authenticated;

grant execute on all functions in schema private to authenticated;

revoke execute on function public.create_organization(text, text, text, integer, text, text) from public, anon;
revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.create_organization(text, text, text, integer, text, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;
