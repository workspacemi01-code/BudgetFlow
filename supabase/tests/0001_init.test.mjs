import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const MIGRATION = new URL('../migrations/0001_init.sql', import.meta.url)

// Minimal stand-in for the Supabase platform objects the migration relies on.
const SUPABASE_STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                  (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant usage on schema auth, storage, public to anon, authenticated;
grant execute on all functions in schema auth to anon, authenticated;
grant select, insert on storage.objects to authenticated;
`

const db = new PGlite()
let passed = 0, failed = 0
const ok = (label, cond, extra = '') => {
  if (cond) { passed++; console.log(`  ✓ ${label}`) }
  else { failed++; console.log(`  ✗ ${label} ${extra}`) }
}

const U = {
  owner:   { id: '11111111-1111-1111-1111-111111111111', email: 'owner@acme.test' },
  finance: { id: '22222222-2222-2222-2222-222222222222', email: 'finance@acme.test' },
  manager: { id: '33333333-3333-3333-3333-333333333333', email: 'manager@acme.test' },
  viewer:  { id: '44444444-4444-4444-4444-444444444444', email: 'viewer@acme.test' },
  outsider:{ id: '55555555-5555-5555-5555-555555555555', email: 'boss@other.test' },
}

async function as(user, sql, params = []) {
  await db.exec(`set role authenticated;
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })}', false);`)
  try { return (await db.query(sql, params)).rows }
  finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`) }
}
async function expectError(label, fn, fragment) {
  try { await fn(); ok(label, false, '(expected an error, got none)') }
  catch (e) { ok(label, !fragment || e.message.includes(fragment), `(got: ${e.message})`) }
}
const one = async (...a) => (await as(...a))[0]

console.log('Applying migration…')
await db.exec(SUPABASE_STUB)
await db.exec(readFileSync(MIGRATION, 'utf8'))
console.log('  ✓ migration applied cleanly\n')

console.log('Auth + onboarding')
for (const u of Object.values(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [u.id, u.email, { full_name: u.email.split('@')[0] }])
ok('profiles created for new users', (await db.query('select count(*)::int n from public.profiles')).rows[0].n === 5)

const orgA = await one(U.owner, `select * from public.create_organization('Acme Ltd', 'acme', 'NGN', 1)`)
const orgB = await one(U.outsider, `select * from public.create_organization('Other Co', 'other-co', 'USD', 4)`)
ok('owner membership created', (await as(U.owner, `select role from public.memberships`))[0]?.role === 'owner')
ok('fiscal period opened (Jan start)', (await one(U.owner, `select name from public.budget_periods`)).name === 'FY2026')
ok('fiscal period opened (Apr start)', (await one(U.outsider, `select name from public.budget_periods`)).name === 'FY2026/27')

const invite = async (email, role) =>
  one(U.owner, `insert into public.memberships (org_id, invited_email, role) values ($1, $2, $3) returning id`, [orgA.id, email, role])
const invFinance = await invite(U.finance.email, 'finance')
const invManager = await invite(U.manager.email, 'dept_manager')
const invViewer = await invite(U.viewer.email, 'viewer')
ok('invitee can see org name before accepting', (await as(U.finance, `select name from public.organizations`))[0]?.name === 'Acme Ltd')
await expectError('outsider cannot accept someone else’s invite',
  () => as(U.outsider, `select public.accept_invitation($1)`, [invFinance.id]), 'not found')
await as(U.finance, `select public.accept_invitation($1)`, [invFinance.id])
await as(U.manager, `select public.accept_invitation($1)`, [invManager.id])
await as(U.viewer, `select public.accept_invitation($1)`, [invViewer.id])
ok('invites accepted', (await as(U.owner, `select count(*)::int n from public.memberships where status = 'active'`))[0].n === 4)
await expectError('finance cannot invite members',
  () => as(U.finance, `insert into public.memberships (org_id, invited_email, role) values ($1, 'x@y.z', 'viewer')`, [orgA.id]))
await expectError('owner cannot demote themselves (org keeps an owner)',
  () => as(U.owner, `update public.memberships set role = 'admin' where user_id = $1`, [U.owner.id]))

console.log('\nBudget structure')
const period = await one(U.owner, `select id from public.budget_periods`)
const mkt = await one(U.owner, `insert into public.departments (org_id, name, code) values ($1, 'Marketing', 'MKT') returning id`, [orgA.id])
const sales = await one(U.owner, `insert into public.departments (org_id, name, code) values ($1, 'Sales', 'SAL') returning id`, [orgA.id])
await as(U.owner, `insert into public.department_budgets (org_id, department_id, period_id, annual_budget) values ($1, $2, $4, 5000000), ($1, $3, $4, 3000000)`, [orgA.id, mkt.id, sales.id, period.id])
const cat = await one(U.owner, `insert into public.categories (org_id, name) values ($1, 'Advertising') returning id`, [orgA.id])
const brand = await one(U.owner, `insert into public.brands (org_id, department_id, name) values ($1, $2, 'Brand X') returning id`, [orgA.id, mkt.id])
const mktLine = await one(U.owner, `insert into public.budget_lines (org_id, period_id, department_id, brand_id, category_id, annual_budget) values ($1, $2, $3, $4, $5, 1000000) returning id`, [orgA.id, period.id, mkt.id, brand.id, cat.id])
const salesLine = await one(U.owner, `insert into public.budget_lines (org_id, period_id, department_id, category_id, annual_budget) values ($1, $2, $3, $4, 2000000) returning id`, [orgA.id, period.id, sales.id, cat.id])
await as(U.owner, `insert into public.membership_departments (membership_id, department_id, org_id) values ($1, $2, $3)`, [invManager.id, mkt.id, orgA.id])
await expectError('brand must belong to the line’s department',
  () => as(U.owner, `insert into public.budget_lines (org_id, period_id, department_id, brand_id, category_id, annual_budget) values ($1, $2, $3, $4, $5, 1)`, [orgA.id, period.id, sales.id, brand.id, cat.id]))

console.log('\nTenant isolation & department scoping')
ok('manager sees only Marketing lines', (await as(U.manager, `select count(*)::int n from public.budget_lines`))[0].n === 1)
ok('viewer (no assignment) sees all lines', (await as(U.viewer, `select count(*)::int n from public.budget_lines`))[0].n === 2)
ok('outsider sees no Acme departments', (await as(U.outsider, `select count(*)::int n from public.departments`))[0].n === 0)
ok('outsider sees no Acme totals via views', (await as(U.outsider, `select count(*)::int n from public.v_budget_line_totals`))[0].n === 0)
const otherPeriod = await one(U.outsider, `select id from public.budget_periods`)
const otherDept = await one(U.outsider, `insert into public.departments (org_id, name, code) values ($1, 'Ops', 'OPS') returning id`, [orgB.id])
const otherCat = await one(U.outsider, `insert into public.categories (org_id, name) values ($1, 'Travel') returning id`, [orgB.id])
await expectError('outsider cannot attach their line to Acme’s department',
  () => as(U.outsider, `insert into public.budget_lines (org_id, period_id, department_id, category_id, annual_budget) values ($1, $2, $3, $4, 1)`, [orgB.id, otherPeriod.id, mkt.id, otherCat.id]))
await expectError('outsider cannot write into Acme',
  () => as(U.outsider, `insert into public.departments (org_id, name, code) values ($1, 'Hack', 'HCK')`, [orgA.id]))

console.log('\nTransaction lifecycle')
const t1 = await one(U.manager, `insert into public.transactions (org_id, budget_line_id, description, approved_amount, status) values ($1, $2, 'Billboards', 300000, 'pending') returning id, txn_code, created_by`, [orgA.id, mktLine.id])
ok('txn code generated TXN-1001', t1.txn_code === 'TXN-1001')
ok('created_by forced to caller', t1.created_by === U.manager.id)
await expectError('manager cannot create in Sales',
  () => as(U.manager, `insert into public.transactions (org_id, budget_line_id, description, approved_amount, status) values ($1, $2, 'x', 1, 'pending')`, [orgA.id, salesLine.id]))
await expectError('manager cannot approve',
  () => as(U.manager, `update public.transactions set status = 'approved' where id = $1`, [t1.id]), 'approve')
await as(U.finance, `update public.transactions set status = 'approved' where id = $1`, [t1.id])
let line = await one(U.finance, `select * from public.v_budget_line_totals where budget_line_id = $1`, [mktLine.id])
ok('approved → committed 300k, available 700k', +line.committed === 300000 && +line.available === 700000, JSON.stringify(line))
await expectError('amount locked after approval',
  () => as(U.finance, `update public.transactions set approved_amount = 1 where id = $1`, [t1.id]), 'locked')
await expectError('manager cannot mark paid by hand',
  () => as(U.manager, `update public.transactions set status = 'paid' where id = $1`, [t1.id]))
await as(U.finance, `insert into public.payments (org_id, transaction_id, amount) values ($1, $2, 100000)`, [orgA.id, t1.id])
ok('partial payment → partially_paid', (await one(U.finance, `select status from public.transactions where id = $1`, [t1.id])).status === 'partially_paid')
line = await one(U.finance, `select * from public.v_budget_line_totals where budget_line_id = $1`, [mktLine.id])
ok('spent 100k, committed 200k, available 700k', +line.spent === 100000 && +line.committed === 200000 && +line.available === 700000, JSON.stringify(line))
await expectError('manager cannot record payments',
  () => as(U.manager, `insert into public.payments (org_id, transaction_id, amount) values ($1, $2, 1)`, [orgA.id, t1.id]))
await expectError('overpayment rejected',
  () => as(U.finance, `insert into public.payments (org_id, transaction_id, amount) values ($1, $2, 250000)`, [orgA.id, t1.id]), 'exceed')
await as(U.finance, `insert into public.payments (org_id, transaction_id, amount) values ($1, $2, 200000)`, [orgA.id, t1.id])
ok('full payment → paid', (await one(U.finance, `select status from public.transactions where id = $1`, [t1.id])).status === 'paid')
await expectError('cannot void a paid transaction',
  () => as(U.finance, `update public.transactions set status = 'voided', void_reason = 'oops' where id = $1`, [t1.id]))
const pay = await one(U.finance, `select id from public.payments where transaction_id = $1 order by amount desc limit 1`, [t1.id])
await as(U.finance, `update public.payments set voided_at = now(), void_reason = 'duplicate' where id = $1`, [pay.id])
ok('voiding a payment re-derives status', (await one(U.finance, `select status from public.transactions where id = $1`, [t1.id])).status === 'partially_paid')

console.log('\nOver-budget & transfers')
const t2 = await one(U.manager, `insert into public.transactions (org_id, budget_line_id, description, approved_amount, status) values ($1, $2, 'TV campaign', 800000, 'pending') returning id`, [orgA.id, mktLine.id])
await expectError('approval blocked over budget', () => as(U.finance, `update public.transactions set status = 'approved' where id = $1`, [t2.id]), 'Over budget')
await expectError('manager cannot transfer from Sales',
  () => as(U.manager, `insert into public.budget_transfers (org_id, from_line_id, to_line_id, amount, reason) values ($1, $2, $3, 500000, 'need more')`, [orgA.id, salesLine.id, mktLine.id]))
const tr = await one(U.finance, `insert into public.budget_transfers (org_id, from_line_id, to_line_id, amount, reason) values ($1, $2, $3, 500000, 'TV push') returning id, status`, [orgA.id, salesLine.id, mktLine.id])
ok('transfer starts pending', tr.status === 'pending')
await as(U.finance, `update public.budget_transfers set status = 'approved' where id = $1`, [tr.id])
line = await one(U.finance, `select * from public.v_budget_line_totals where budget_line_id = $1`, [mktLine.id])
ok('transfer raises Marketing effective budget to 1.5M', +line.effective_budget === 1500000, JSON.stringify(line))
await as(U.finance, `update public.transactions set status = 'approved' where id = $1`, [t2.id])
ok('approval succeeds after transfer', (await one(U.finance, `select status from public.transactions where id = $1`, [t2.id])).status === 'approved')
await expectError('cannot shrink a line below spent + committed',
  () => as(U.finance, `update public.budget_lines set annual_budget = 0 where id = $1`, [mktLine.id]), 'reduced')
await as(U.owner, `update public.organizations set allow_over_budget = true where id = $1`, [orgA.id])
const t3 = await one(U.manager, `insert into public.transactions (org_id, budget_line_id, description, approved_amount, status) values ($1, $2, 'Radio', 900000, 'pending') returning id`, [orgA.id, mktLine.id])
await expectError('finance cannot approve over budget even when allowed', () => as(U.finance, `update public.transactions set status = 'approved' where id = $1`, [t3.id]), 'owner or admin')
await as(U.owner, `update public.transactions set status = 'approved' where id = $1`, [t3.id])
ok('owner over-budget approval flagged', (await one(U.owner, `select over_budget from public.transactions where id = $1`, [t3.id])).over_budget === true)
await expectError('admin cannot change plan (billing-managed)',
  () => as(U.owner, `update public.organizations set plan = 'enterprise' where id = $1`, [orgA.id]), 'billing')

console.log('\nVoiding, summaries, audit, storage')
const t4 = await one(U.manager, `insert into public.transactions (org_id, budget_line_id, description, approved_amount) values ($1, $2, 'Draft item', 5000) returning id`, [orgA.id, mktLine.id])
await expectError('void requires a reason', () => as(U.manager, `update public.transactions set status = 'voided' where id = $1`, [t4.id]), 'reason')
await as(U.manager, `update public.transactions set status = 'voided', void_reason = 'duplicate' where id = $1`, [t4.id])
await expectError('transactions cannot be deleted', async () => {
  const r = await as(U.owner, `delete from public.transactions where id = $1 returning id`, [t4.id])
  if (r.length === 0) throw new Error('no rows deleted')
})
const dept = await one(U.finance, `select * from public.v_department_summary where department_id = $1`, [mkt.id])
ok('department summary: budget 5.5M after transfer-in', +dept.budget === 5500000, JSON.stringify(dept))
ok('department summary: spent + committed consistent', +dept.spent === 100000 && +dept.committed === 200000 + 800000 + 900000, JSON.stringify(dept))
const monthly = await as(U.finance, `select * from public.v_monthly_summary`)
ok('monthly summary has rows', monthly.length >= 1)
ok('finance can read audit log', (await as(U.finance, `select count(*)::int n from public.audit_logs`))[0].n > 10)
ok('manager cannot read audit log', (await as(U.manager, `select count(*)::int n from public.audit_logs`))[0].n === 0)
await expectError('audit log is not writable',
  () => as(U.owner, `insert into public.audit_logs (org_id, entity, action) values ($1, 'x', 'insert')`, [orgA.id]))
await as(U.manager, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${orgA.id}/${t1.id}/receipt.pdf`])
ok('manager can upload receipt to own txn', true)
await expectError('outsider cannot upload into Acme folder',
  () => as(U.outsider, `insert into storage.objects (bucket_id, name) values ('receipts', $1)`, [`${orgA.id}/${t1.id}/evil.pdf`]))
ok('outsider cannot read Acme receipts', (await as(U.outsider, `select count(*)::int n from storage.objects`))[0].n === 0)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
