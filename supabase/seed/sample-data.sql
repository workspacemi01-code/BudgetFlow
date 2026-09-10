-- =============================================================================
-- BudgetFlow — sample data for ONE account
-- Creates the "Rite Foods Nigeria" organization (FY2026, 5 departments, 16 budget
-- lines, 29 transactions with payments, 4 pending invites) owned by v_email.
--
-- Run in Supabase → SQL Editor. The account must already exist (sign up first).
-- Safe to run again. If the account already has the older "Acme Nigeria Ltd"
-- sample org, it is renamed instead of duplicated.
-- Every other account keeps starting with an empty organization.
-- =============================================================================

-- Server-side scripts (service role) need table access on newer Supabase projects.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

do $$
declare
  v_email  text := 'koredebusuyi.career@gmail.com';
  v_user   uuid;
  v_org    uuid;
  v_period uuid;
begin
  select id into v_user from auth.users where lower(email) = lower(v_email);
  if v_user is null then
    raise exception 'No account for % yet — sign up in the app first, then run this again.', v_email;
  end if;

  -- Already loaded (under either name)? Make sure it carries the current name, then stop.
  select id into v_org
  from public.organizations
  where created_by = v_user and name in ('Acme Nigeria Ltd', 'Rite Foods Nigeria')
  limit 1;
  if v_org is not null then
    update public.organizations set name = 'Rite Foods Nigeria' where id = v_org and name <> 'Rite Foods Nigeria';
    update public.memberships
    set invited_email = replace(invited_email, '@acme.example', '@ritefoods.example')
    where org_id = v_org and invited_email like '%@acme.example';
    raise notice 'Sample organization for % is now named Rite Foods Nigeria.', v_email;
    return;
  end if;

  -- Organization, owner membership, financial year ---------------------------
  insert into public.organizations (name, slug, currency, fiscal_year_start, industry, created_by)
  values ('Rite Foods Nigeria', 'rite-foods-' || substr(md5(random()::text), 1, 4), 'NGN', 1, 'Food & beverages', v_user)
  returning id into v_org;

  insert into public.memberships (org_id, user_id, role, status, invited_by)
  values (v_org, v_user, 'owner', 'active', v_user);

  insert into public.budget_periods (org_id, name, start_date, end_date)
  values (v_org, 'FY2026', '2026-01-01', '2026-12-31')
  returning id into v_period;

  -- Departments and their annual budgets -------------------------------------
  insert into public.departments (org_id, name, code) values
    (v_org, 'Marketing', 'MKT'),
    (v_org, 'Sales', 'SLS'),
    (v_org, 'Operations', 'OPS'),
    (v_org, 'Human Resources', 'HR'),
    (v_org, 'IT', 'IT');

  insert into public.department_budgets (org_id, department_id, period_id, annual_budget)
  select v_org, d.id, v_period, b.amount
  from (values ('MKT', 100000000), ('SLS', 70000000), ('OPS', 55000000), ('HR', 25000000), ('IT', 40000000))
       as b(code, amount)
  join public.departments d on d.org_id = v_org and d.code = b.code;

  -- Brands and categories ----------------------------------------------------
  insert into public.brands (org_id, department_id, name)
  select v_org, d.id, b.name
  from (values ('MKT', 'Zest'), ('MKT', 'Kora'), ('SLS', 'Retail'), ('SLS', 'Enterprise')) as b(code, name)
  join public.departments d on d.org_id = v_org and d.code = b.code;

  insert into public.categories (org_id, name)
  select v_org, unnest(array['Advertising', 'Events', 'Travel', 'Software', 'Consulting',
                             'Equipment', 'Logistics', 'Training', 'Recruitment']);

  -- Budget lines: department × (optional) brand × category ---------------------
  insert into public.budget_lines (org_id, period_id, department_id, brand_id, category_id, annual_budget)
  select v_org, v_period, d.id, b.id, c.id, l.budget
  from (values
    ('MKT', 'Zest',       'Advertising', 30000000),
    ('MKT', 'Zest',       'Events',      15000000),
    ('MKT', 'Kora',       'Advertising', 25000000),
    ('MKT', 'Kora',       'Travel',       8000000),
    ('MKT', null,         'Software',    10000000),
    ('SLS', 'Retail',     'Travel',      12000000),
    ('SLS', 'Retail',     'Events',      18000000),
    ('SLS', 'Enterprise', 'Consulting',  20000000),
    ('SLS', 'Enterprise', 'Travel',      15000000),
    ('OPS', null,         'Equipment',   25000000),
    ('OPS', null,         'Logistics',   20000000),
    ('OPS', null,         'Software',     8000000),
    ('HR',  null,         'Training',    12000000),
    ('HR',  null,         'Recruitment', 10000000),
    ('IT',  null,         'Software',    25000000),
    ('IT',  null,         'Equipment',   15000000)
  ) as l(dept, brand, category, budget)
  join public.departments d     on d.org_id = v_org and d.code = l.dept
  join public.categories c      on c.org_id = v_org and c.name = l.category
  left join public.brands b     on b.department_id = d.id and b.name = l.brand;

  -- Transactions. Paid / part-paid ones start as approved; the payments below
  -- move them on (a trigger derives the status from what has been paid).
  insert into public.transactions (
    org_id, budget_line_id, txn_code, txn_date, description, vendor, approved_amount, status, created_by,
    submitted_at, approved_by, approved_at, rejected_by, rejected_at, rejection_reason, voided_by, voided_at, void_reason
  )
  select
    v_org, bl.id, t.code, t.day::date, t.description, t.vendor, t.amount,
    (case when t.status in ('paid', 'partially_paid') then 'approved' else t.status end)::public.txn_status,
    v_user,
    t.day::date + time '09:00',
    case when t.status in ('approved', 'partially_paid', 'paid') then v_user end,
    case when t.status in ('approved', 'partially_paid', 'paid') then t.day::date + 1 + time '10:00' end,
    case when t.status = 'rejected' then v_user end,
    case when t.status = 'rejected' then t.day::date + 1 + time '10:00' end,
    case when t.status = 'rejected' then t.note end,
    case when t.status = 'voided' then v_user end,
    case when t.status = 'voided' then t.day::date + 1 + time '10:00' end,
    case when t.status = 'voided' then t.note end
  from (values
    ('TXN-1001', '2026-01-12', 'MKT', 'Zest',       'Advertising', 'Q1 Google Ads campaign',          'Google Ireland',        6500000, 'paid',           null),
    ('TXN-1002', '2026-01-20', 'IT',  null,         'Software',    'Microsoft 365 annual licences',   'Microsoft',             9800000, 'paid',           null),
    ('TXN-1003', '2026-02-03', 'MKT', 'Zest',       'Events',      'Lagos product launch event',      'Eko Hotels',            7200000, 'partially_paid', null),
    ('TXN-1004', '2026-02-14', 'SLS', 'Retail',     'Travel',      'Regional sales trip — Abuja',     'Air Peace',             1850000, 'paid',           null),
    ('TXN-1005', '2026-02-22', 'OPS', null,         'Equipment',   'Forklift purchase',               'Mikano',               11000000, 'paid',           null),
    ('TXN-1006', '2026-03-05', 'HR',  null,         'Training',    'Leadership training cohort',      'Lagos Business School', 4500000, 'paid',           null),
    ('TXN-1007', '2026-03-18', 'MKT', 'Kora',       'Advertising', 'Billboard — Lekki-Ikoyi bridge',  'Alpha Outdoor',         9000000, 'approved',       null),
    ('TXN-1008', '2026-03-27', 'SLS', 'Enterprise', 'Consulting',  'CRM implementation consultants',  'Andersen Nigeria',      8000000, 'partially_paid', null),
    ('TXN-1009', '2026-04-08', 'IT',  null,         'Equipment',   'Staff laptops (20 units)',        'Slot Systems',         12400000, 'paid',           null),
    ('TXN-1010', '2026-04-15', 'OPS', null,         'Logistics',   'Q2 haulage contract',             'GIG Logistics',         6300000, 'paid',           null),
    ('TXN-1011', '2026-04-29', 'MKT', 'Kora',       'Travel',      'Influencer tour — Port Harcourt', 'Arik Air',              2100000, 'paid',           null),
    ('TXN-1012', '2026-05-06', 'SLS', 'Retail',     'Events',      'Trade fair booth',                'Landmark Centre',       5600000, 'paid',           null),
    ('TXN-1013', '2026-05-19', 'MKT', 'Zest',       'Advertising', 'Meta ads — mid-year push',        'Meta Platforms',        8200000, 'partially_paid', null),
    ('TXN-1014', '2026-05-28', 'HR',  null,         'Recruitment', 'Recruitment agency fees',         'Workforce Group',       3400000, 'approved',       null),
    ('TXN-1015', '2026-06-09', 'OPS', null,         'Software',    'Fleet tracking software',         'Tranzit',               2700000, 'paid',           null),
    ('TXN-1016', '2026-06-17', 'SLS', 'Enterprise', 'Travel',      'Client visits — Kano & Kaduna',   'Overland Airways',      2950000, 'paid',           null),
    ('TXN-1017', '2026-06-30', 'MKT', null,         'Software',    'Design tools (Figma, Canva)',     'Figma',                 1600000, 'paid',           null),
    ('TXN-1018', '2026-07-07', 'MKT', 'Zest',       'Events',      'Customer appreciation dinner',    'Radisson Blu',          4800000, 'approved',       null),
    ('TXN-1019', '2026-07-16', 'IT',  null,         'Software',    'Cloud hosting — H2',              'AWS',                   7500000, 'partially_paid', null),
    ('TXN-1020', '2026-07-25', 'OPS', null,         'Equipment',   'Generator servicing',             'Mikano',                3200000, 'paid',           null),
    ('TXN-1021', '2026-08-04', 'HR',  null,         'Training',    'Excel & data skills training',    'NIIT',                  1900000, 'approved',       null),
    ('TXN-1022', '2026-08-12', 'SLS', 'Retail',     'Travel',      'Sales conference travel',         'Air Peace',             2400000, 'rejected',       'Travel freeze for Q3'),
    ('TXN-1023', '2026-08-20', 'MKT', 'Kora',       'Advertising', 'Radio jingles — Cool FM',         'Cool FM',               3600000, 'voided',         'Duplicate of an existing radio booking'),
    ('TXN-1024', '2026-08-28', 'MKT', 'Zest',       'Advertising', 'Q4 TikTok campaign',              'TikTok',                5500000, 'pending',        null),
    ('TXN-1025', '2026-09-01', 'SLS', 'Enterprise', 'Consulting',  'Pricing strategy advisory',       'PwC Nigeria',           6000000, 'pending',        null),
    ('TXN-1026', '2026-09-03', 'IT',  null,         'Equipment',   'Network switches upgrade',        'Cisco partner',         4200000, 'pending',        null),
    ('TXN-1027', '2026-09-05', 'SLS', 'Retail',     'Events',      'Roadshow — Ibadan',               'Sheraton',              3100000, 'pending',        null),
    ('TXN-1028', '2026-09-08', 'HR',  null,         'Recruitment', 'Graduate trainee assessment',     'SHL',                   1750000, 'pending',        null),
    ('TXN-1029', '2026-09-09', 'MKT', 'Kora',       'Travel',      'Media trip — Accra',              'Africa World Airlines', 2300000, 'pending',        null)
  ) as t(code, day, dept, brand, category, description, vendor, amount, status, note)
  join public.departments dp on dp.org_id = v_org and dp.code = t.dept
  join public.categories c   on c.org_id = v_org and c.name = t.category
  left join public.brands b  on b.department_id = dp.id and b.name = t.brand
  join public.budget_lines bl
    on bl.period_id = v_period and bl.department_id = dp.id and bl.category_id = c.id
   and bl.brand_id is not distinct from b.id;

  -- Payments (spent) ---------------------------------------------------------
  insert into public.payments (org_id, transaction_id, amount, paid_on, method, created_by)
  select v_org, tx.id, p.paid, tx.txn_date + 7, 'Bank transfer', v_user
  from (values
    ('TXN-1001', 6500000), ('TXN-1002', 9800000), ('TXN-1003', 4000000), ('TXN-1004', 1850000),
    ('TXN-1005', 11000000), ('TXN-1006', 4500000), ('TXN-1008', 5000000), ('TXN-1009', 12400000),
    ('TXN-1010', 6300000), ('TXN-1011', 2100000), ('TXN-1012', 5600000), ('TXN-1013', 3000000),
    ('TXN-1015', 2700000), ('TXN-1016', 2950000), ('TXN-1017', 1600000), ('TXN-1019', 2500000),
    ('TXN-1020', 3200000)
  ) as p(code, paid)
  join public.transactions tx on tx.org_id = v_org and tx.txn_code = p.code;

  -- Pending invitations, so Settings → People shows every role (no emails are sent)
  insert into public.memberships (org_id, invited_email, role, status, invited_by) values
    (v_org, 'tunde@ritefoods.example',    'finance',      'pending', v_user),
    (v_org, 'chiamaka@ritefoods.example', 'dept_manager', 'pending', v_user),
    (v_org, 'ibrahim@ritefoods.example',  'dept_manager', 'pending', v_user),
    (v_org, 'grace@ritefoods.example',    'viewer',       'pending', v_user);

  insert into public.membership_departments (membership_id, department_id, org_id)
  select m.id, d.id, v_org
  from (values ('chiamaka@ritefoods.example', 'MKT'), ('ibrahim@ritefoods.example', 'SLS')) as x(email, code)
  join public.memberships m on m.org_id = v_org and m.invited_email = x.email
  join public.departments d on d.org_id = v_org and d.code = x.code;

  raise notice 'Loaded Rite Foods Nigeria sample data for %.', v_email;
end;
$$;
