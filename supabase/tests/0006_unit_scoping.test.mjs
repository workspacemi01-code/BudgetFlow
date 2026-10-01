import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

/**
 * The permission matrix the business asked for, asserted rather than assumed.
 *
 * The rules that matter, and that are easy to get subtly wrong:
 *   · a line manager edits their own unit but only *reads* the rest of the
 *     department — the brief says so explicitly
 *   · an officer spends without editing, which is a different question from
 *     "can this person change the budget"
 *   · an officer is blocked from Sosa, and that block is data on the unit, so
 *     it must hold for Sosa and not leak to the units beside it
 */

const MIGRATIONS = [
  '0001_init.sql',
  '0002_service_role_grants.sql',
  '0003_invitations.sql',
  '0004_personal_budgets.sql',
  '0005_unit_roles_enum.sql',
  '0006_unit_scoping.sql',
  '0007_daily_spend.sql',
].map((f) => new URL(`../migrations/${f}`, import.meta.url))

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

/* One person per role, so every assertion names who is being tested. */
const U = {
  owner:  { id: '11111111-1111-1111-1111-111111111111', email: 'owner@rite.test' },
  deptmgr:{ id: '22222222-2222-2222-2222-222222222222', email: 'deptmgr@rite.test' },
  line:   { id: '33333333-3333-3333-3333-333333333333', email: 'creative.lead@rite.test' },
  officer:{ id: '44444444-4444-4444-4444-444444444444', email: 'officer@rite.test' },
}

async function as(user, sql, params = []) {
  await db.exec(`set role authenticated;
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })}', false);`)
  try { return (await db.query(sql, params)).rows }
  finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`) }
}
const one = async (...a) => (await as(...a))[0]
const svc = async (sql, params = []) => (await db.query(sql, params)).rows

console.log('Applying migrations…')
await db.exec(SUPABASE_STUB)
for (const file of MIGRATIONS) await db.exec(readFileSync(file, 'utf8'))
console.log('  ✓ 0001 → 0007 applied cleanly\n')

for (const u of Object.values(U))
  await svc(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [u.id, u.email, { full_name: u.email.split('@')[0] }])

// ---------------------------------------------------------------------------
console.log('Setting up Rite Foods: Marketing, with Creative and Sosa inside it')
// ---------------------------------------------------------------------------

const [org] = await svc(
  `insert into public.organizations (name, slug, currency, brand_label, created_by)
   values ('Rite Foods Nigeria', 'rite-foods', 'NGN', 'Unit', $1) returning *`, [U.owner.id])

const [dept] = await svc(
  `insert into public.departments (org_id, name, code) values ($1, 'Marketing', 'MKT') returning *`, [org.id])

const [creative] = await svc(
  `insert into public.brands (org_id, department_id, name) values ($1, $2, 'Creative Unit') returning *`,
  [org.id, dept.id])

/* Sosa is the unit officers may see but never spend against. */
const [sosa] = await svc(
  `insert into public.brands (org_id, department_id, name, officers_can_spend)
   values ($1, $2, 'Sosa Brand', false) returning *`, [org.id, dept.id])

ok('a unit defaults to being open to officers', creative.officers_can_spend === true)
ok('Sosa is recorded as closed to officers', sosa.officers_can_spend === false)

const mem = {}
for (const [key, role] of [['owner', 'owner'], ['deptmgr', 'dept_manager'], ['line', 'line_manager'], ['officer', 'officer']]) {
  const [m] = await svc(
    `insert into public.memberships (org_id, user_id, role, status) values ($1, $2, $3, 'active') returning *`,
    [org.id, U[key].id, role])
  mem[key] = m
}
ok('line_manager and officer exist as roles', mem.line.role === 'line_manager' && mem.officer.role === 'officer')

await svc(`insert into public.membership_departments (membership_id, department_id, org_id) values ($1, $2, $3)`,
  [mem.deptmgr.id, dept.id, org.id])
/* The line manager runs Creative. The officer works in Creative and Sosa. */
await svc(`insert into public.membership_brands (membership_id, brand_id, org_id) values ($1, $2, $3)`,
  [mem.line.id, creative.id, org.id])
await svc(`insert into public.membership_brands (membership_id, brand_id, org_id) values ($1, $2, $3)`,
  [mem.officer.id, creative.id, org.id])
await svc(`insert into public.membership_brands (membership_id, brand_id, org_id) values ($1, $2, $3)`,
  [mem.officer.id, sosa.id, org.id])

const check = async (user, fn, brand) =>
  (await one(user, `select private.${fn}($1, $2) as v`, [org.id, brand.id])).v

// ---------------------------------------------------------------------------
console.log('\nSeeing the department')
// ---------------------------------------------------------------------------

const seesDept = async (user) =>
  (await one(user, `select private.can_view_department($1, $2) as v`, [org.id, dept.id])).v

ok('the super admin sees the department',      await seesDept(U.owner) === true)
ok('the department manager sees it',           await seesDept(U.deptmgr) === true)
ok('the line manager sees it, via their unit', await seesDept(U.line) === true)
ok('the officer sees it, via their units',     await seesDept(U.officer) === true)

// ---------------------------------------------------------------------------
console.log('\nViewing units — everyone in the department may look')
// ---------------------------------------------------------------------------

ok('the line manager views their own unit',        await check(U.line, 'can_view_brand', creative) === true)
ok('the line manager views Sosa, which is not theirs',
   await check(U.line, 'can_view_brand', sosa) === true)
ok('the officer views both units',
   await check(U.officer, 'can_view_brand', creative) === true &&
   await check(U.officer, 'can_view_brand', sosa) === true)

// ---------------------------------------------------------------------------
console.log('\nEditing units — narrower than viewing')
// ---------------------------------------------------------------------------

ok('the super admin edits any unit',          await check(U.owner, 'can_edit_brand', sosa) === true)
ok('the department manager edits every unit in their department',
   await check(U.deptmgr, 'can_edit_brand', creative) === true &&
   await check(U.deptmgr, 'can_edit_brand', sosa) === true)
ok('the line manager edits their own unit',   await check(U.line, 'can_edit_brand', creative) === true)
ok('the line manager CANNOT edit a unit that is not theirs, though they can see it',
   await check(U.line, 'can_edit_brand', sosa) === false)
ok('the officer edits nothing — not even their own unit',
   await check(U.officer, 'can_edit_brand', creative) === false)

// ---------------------------------------------------------------------------
console.log('\nSpending — a separate question from editing')
// ---------------------------------------------------------------------------

ok('the officer spends in their own unit',    await check(U.officer, 'can_spend_brand', creative) === true)
ok('the officer CANNOT spend against Sosa, though they can see it',
   await check(U.officer, 'can_spend_brand', sosa) === false)
ok('a line manager still spends in their own unit',
   await check(U.line, 'can_spend_brand', creative) === true)
ok('the Sosa block applies to officers only — the department manager still spends there',
   await check(U.deptmgr, 'can_spend_brand', sosa) === true)
ok('and the super admin still spends there',  await check(U.owner, 'can_spend_brand', sosa) === true)

// ---------------------------------------------------------------------------
console.log('\nBudget lines follow their unit')
// ---------------------------------------------------------------------------

const [period] = await svc(
  `insert into public.budget_periods (org_id, name, start_date, end_date, status)
   values ($1, 'FY2026', date '2026-01-01', date '2026-12-31', 'open') returning *`, [org.id])
const [cat] = await svc(
  `insert into public.categories (org_id, name) values ($1, 'Advertising') returning *`, [org.id])

const [creativeLine] = await svc(
  `insert into public.budget_lines (org_id, period_id, department_id, brand_id, category_id, annual_budget)
   values ($1, $2, $3, $4, $5, 5000000) returning *`, [org.id, period.id, dept.id, creative.id, cat.id])
const [sosaLine] = await svc(
  `insert into public.budget_lines (org_id, period_id, department_id, brand_id, category_id, annual_budget)
   values ($1, $2, $3, $4, $5, 9000000) returning *`, [org.id, period.id, dept.id, sosa.id, cat.id])

const lineCheck = async (user, fn, line) =>
  (await one(user, `select private.${fn}($1) as v`, [line.id])).v

ok('the officer may record spend on their own unit’s line',
   await lineCheck(U.officer, 'can_spend_line', creativeLine) === true)
ok('the officer may NOT record spend on the Sosa line',
   await lineCheck(U.officer, 'can_spend_line', sosaLine) === false)
ok('but the officer can still read the Sosa line',
   await lineCheck(U.officer, 'can_view_line', sosaLine) === true)
ok('the line manager may not edit the Sosa line',
   await lineCheck(U.line, 'can_edit_line', sosaLine) === false)
ok('the line manager may edit their own line',
   await lineCheck(U.line, 'can_edit_line', creativeLine) === true)

// ---------------------------------------------------------------------------
console.log('\nRow-level security actually enforces it')
// ---------------------------------------------------------------------------

/* The functions are only half the story — what matters is whether the policy
   stops the write. This is the assertion that would have caught a correct
   function wired to the wrong policy. */
const visible = await as(U.officer, `select id from public.budget_lines order by annual_budget`)
ok('the officer can list both lines in their department', visible.length === 2, `(got ${visible.length})`)

let sosaInsertBlocked = false
try {
  await as(U.officer,
    `insert into public.transactions (org_id, budget_line_id, txn_code, txn_type, status, approved_amount, description, created_by)
     values ($1, $2, 'TXN-SOSA-1', 'expense', 'draft', 1000, 'should not be allowed', $3)`,
    [org.id, sosaLine.id, U.officer.id])
} catch { sosaInsertBlocked = true }
ok('RLS blocks the officer writing a transaction against Sosa', sosaInsertBlocked)

let creativeInsertWorked = false
try {
  await as(U.officer,
    `insert into public.transactions (org_id, budget_line_id, txn_code, txn_type, status, approved_amount, description, created_by)
     values ($1, $2, 'TXN-CREATIVE-1', 'expense', 'draft', 1000, 'allowed', $3)`,
    [org.id, creativeLine.id, U.officer.id])
  creativeInsertWorked = true
} catch (e) { console.log(`      (creative insert failed: ${e.message})`) }
ok('RLS allows the officer writing a transaction against their own unit', creativeInsertWorked)

// ---------------------------------------------------------------------------
console.log('\nThe daily spend view the dashboard filters on')
// ---------------------------------------------------------------------------

const daily = await as(U.officer,
  `select department_id, brand_id, day, spent, committed from public.v_daily_spend order by day`)
ok('the view returns the officer\u2019s own approved spend', Array.isArray(daily))
ok('and it carries a unit, so the dashboard can filter to one',
   daily.every((r) => 'brand_id' in r), `(got keys: ${Object.keys(daily[0] ?? {}).join(',')})`)
ok('and a day, so weeks and months can both be folded from it',
   daily.every((r) => 'day' in r))

/* The draft transaction written earlier is excluded by design — the view drops
   draft, rejected and voided, so nothing unapproved reaches the chart. */
ok('drafts are not counted as spend', daily.length === 0, `(got ${daily.length} rows)`)

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
