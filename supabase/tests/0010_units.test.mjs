import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

/**
 * Three levels: Department → Brand → Unit, with an officer per unit.
 *
 * The questions worth asking of a hierarchy this shape:
 *   · does an officer in one unit stay out of its sibling?
 *   · does closing a brand close every unit inside it?
 *   · does closing one unit leave its siblings alone?
 *   · does a budget line ask the deepest thing it belongs to, rather than
 *     the department it happens to sit under?
 */

const MIGRATIONS = [
  '0001_init.sql', '0002_service_role_grants.sql', '0003_invitations.sql',
  '0004_personal_budgets.sql', '0005_unit_roles_enum.sql', '0006_unit_scoping.sql',
  '0007_daily_spend.sql', '0008_org_brand_theme.sql', '0009_unit_table_grants.sql',
  '0010_units.sql',
  '0011_department_approval.sql',
  '0012_units_under_departments.sql',
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

const U = {
  owner:   { id: '11111111-1111-1111-1111-111111111111', email: 'owner@rite.test' },
  deptmgr: { id: '22222222-2222-2222-2222-222222222222', email: 'deptmgr@rite.test' },
  eventsLead:   { id: '33333333-3333-3333-3333-333333333333', email: 'events.lead@rite.test' },
  eventsOfficer:{ id: '44444444-4444-4444-4444-444444444444', email: 'events.officer@rite.test' },
  sosaOfficer:  { id: '55555555-5555-5555-5555-555555555555', email: 'sosa.officer@rite.test' },
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
for (const f of MIGRATIONS) await db.exec(readFileSync(f, 'utf8'))
console.log('  ✓ 0001 → 0012 applied cleanly\n')

for (const u of Object.values(U))
  await svc(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [u.id, u.email, { full_name: u.email.split('@')[0] }])

// ---------------------------------------------------------------------------
console.log('Marketing → Fearless and Sosa → their units')
// ---------------------------------------------------------------------------

const [org] = await svc(
  `insert into public.organizations (name, slug, currency, created_by)
   values ('Rite Foods Nigeria', 'rite-foods', 'NGN', $1) returning *`, [U.owner.id])
const [dept] = await svc(
  `insert into public.departments (org_id, name, code) values ($1, 'Marketing', 'MKT') returning *`, [org.id])

const [fearless] = await svc(
  `insert into public.brands (org_id, department_id, name) values ($1, $2, 'Fearless Brand') returning *`,
  [org.id, dept.id])
/* Sosa is closed to officers at brand level — every unit inside it. */
const [sosa] = await svc(
  `insert into public.brands (org_id, department_id, name, officers_can_spend)
   values ($1, $2, 'Sosa Brand', false) returning *`, [org.id, dept.id])

/* Six units in Marketing, as the brief lists them. Sosa Brand is a unit whose
   name happens to contain "Brand", and it is the one closed to officers. */
const unit = {}
for (const [key, name, open] of [
  ['events',   'Events', true],
  ['creative', 'Creative Unit', true],
  ['sosa',     'Sosa Brand', false],
  ['bigi',     'Bigi Brand', true],
]) {
  const [u] = await svc(
    `insert into public.units (org_id, department_id, name, officers_can_spend)
     values ($1, $2, $3, $4) returning *`,
    [org.id, dept.id, name, open])
  unit[key] = u
}
ok('units sit directly under the department', unit.events.department_id === dept.id)
ok('a unit needs no brand', unit.events.brand_id === null)
ok('Sosa is the unit closed to officers', unit.sosa.officers_can_spend === false)

const mem = {}
for (const [key, role] of [
  ['owner', 'owner'], ['deptmgr', 'dept_manager'],
  ['eventsLead', 'line_manager'], ['eventsOfficer', 'officer'], ['sosaOfficer', 'officer'],
]) {
  const [m] = await svc(
    `insert into public.memberships (org_id, user_id, role, status) values ($1, $2, $3, 'active') returning *`,
    [org.id, U[key].id, role])
  mem[key] = m
}
await svc(`insert into public.membership_departments (membership_id, department_id, org_id) values ($1,$2,$3)`,
  [mem.deptmgr.id, dept.id, org.id])
for (const [m, u] of [
  [mem.eventsLead, unit.events],
  [mem.eventsOfficer, unit.events],
  [mem.sosaOfficer, unit.sosa],
]) {
  await svc(`insert into public.membership_units (membership_id, unit_id, org_id) values ($1,$2,$3)`,
    [m.id, u.id, org.id])
}

const chk = async (user, fn, u) =>
  (await one(user, `select private.${fn}($1, $2) as v`, [org.id, u.id])).v

// ---------------------------------------------------------------------------
console.log('\nSeeing — everyone in the department may look')
// ---------------------------------------------------------------------------

ok('the Events officer sees their own unit',   await chk(U.eventsOfficer, 'can_view_unit', unit.events) === true)
ok('and sees Creative, which is not theirs',   await chk(U.eventsOfficer, 'can_view_unit', unit.creative) === true)
ok('and sees Sosa, which is closed to them',               await chk(U.eventsOfficer, 'can_view_unit', unit.sosa) === true)

// ---------------------------------------------------------------------------
console.log('\nEditing — a unit manager holds one unit, not the brand')
// ---------------------------------------------------------------------------

ok('the Events lead edits Events',             await chk(U.eventsLead, 'can_edit_unit', unit.events) === true)
ok('the Events lead CANNOT edit Creative, another unit in the department',
   await chk(U.eventsLead, 'can_edit_unit', unit.creative) === false)
ok('the department manager edits every unit in the department',
   await chk(U.deptmgr, 'can_edit_unit', unit.creative) === true &&
   await chk(U.deptmgr, 'can_edit_unit', unit.sosa) === true)
ok('an officer edits nothing',                 await chk(U.eventsOfficer, 'can_edit_unit', unit.events) === false)

// ---------------------------------------------------------------------------
console.log('\nSpending — per unit, and closed where it is closed')
// ---------------------------------------------------------------------------

ok('the Events officer spends in Events',      await chk(U.eventsOfficer, 'can_spend_unit', unit.events) === true)
ok('the Events officer CANNOT spend in Creative, its sibling',
   await chk(U.eventsOfficer, 'can_spend_unit', unit.creative) === false)
ok('the Sosa officer CANNOT spend in Sosa — the rule the brief names',
   await chk(U.sosaOfficer, 'can_spend_unit', unit.sosa) === false)
ok('but still sees it',                        await chk(U.sosaOfficer, 'can_view_unit', unit.sosa) === true)
ok('closing one unit does not close another',
   await chk(U.eventsOfficer, 'can_spend_unit', unit.events) === true)
ok('the department manager still spends in Sosa',
   await chk(U.deptmgr, 'can_spend_unit', unit.sosa) === true)

// Closing one unit must not touch its siblings.
await svc(`update public.units set officers_can_spend = false where id = $1`, [unit.events.id])
ok('closing a single unit stops its officer',  await chk(U.eventsOfficer, 'can_spend_unit', unit.events) === false)
ok('and leaves its sibling open to the department manager',
   await chk(U.deptmgr, 'can_spend_unit', unit.creative) === true)
await svc(`update public.units set officers_can_spend = true where id = $1`, [unit.events.id])

// ---------------------------------------------------------------------------
console.log('\nA budget line asks the deepest thing it belongs to')
// ---------------------------------------------------------------------------

const [period] = await svc(
  `insert into public.budget_periods (org_id, name, start_date, end_date, status)
   values ($1, 'FY2026', date '2026-01-01', date '2026-12-31', 'open') returning *`, [org.id])
const [cat] = await svc(
  `insert into public.categories (org_id, name) values ($1, 'Advertising') returning *`, [org.id])

const [eventsLine] = await svc(
  `insert into public.budget_lines (org_id, period_id, department_id, unit_id, category_id, annual_budget)
   values ($1,$2,$3,$4,$5, 4000000) returning *`,
  [org.id, period.id, dept.id, unit.events.id, cat.id])
const [creativeLine] = await svc(
  `insert into public.budget_lines (org_id, period_id, department_id, unit_id, category_id, annual_budget)
   values ($1,$2,$3,$4,$5, 2000000) returning *`,
  [org.id, period.id, dept.id, unit.creative.id, cat.id])

ok('two units can hold the same category without colliding',
   eventsLine.id !== creativeLine.id)

const lineChk = async (user, fn, line) =>
  (await one(user, `select private.${fn}($1) as v`, [line.id])).v

ok('the Events officer may spend on the Events line',
   await lineChk(U.eventsOfficer, 'can_spend_line', eventsLine) === true)
ok('the Events officer may NOT spend on the Creative line',
   await lineChk(U.eventsOfficer, 'can_spend_line', creativeLine) === false)
ok('but can still read it',
   await lineChk(U.eventsOfficer, 'can_view_line', creativeLine) === true)

// ---------------------------------------------------------------------------
console.log('\nRow-level security enforces it, not just the functions')
// ---------------------------------------------------------------------------

let blocked = false
try {
  await as(U.eventsOfficer,
    `insert into public.transactions (org_id, budget_line_id, txn_code, txn_type, status, approved_amount, description, created_by)
     values ($1,$2,'TXN-X','expense','draft',1000,'not allowed',$3)`,
    [org.id, creativeLine.id, U.eventsOfficer.id])
} catch { blocked = true }
ok('RLS blocks an officer writing against another unit', blocked)

let allowed = false
try {
  await as(U.eventsOfficer,
    `insert into public.transactions (org_id, budget_line_id, txn_code, txn_type, status, approved_amount, description, created_by)
     values ($1,$2,'TXN-Y','expense','draft',1000,'allowed',$3)`,
    [org.id, eventsLine.id, U.eventsOfficer.id])
  allowed = true
} catch (e) { console.log(`      (${e.message})`) }
ok('RLS allows an officer writing against their own unit', allowed)

let readable = true
try { await as(U.owner, `select id, name from public.units limit 1`) }
catch (e) { readable = false; console.log(`      (${e.message})`) }
ok('a signed-in user can read units', readable)

let unitsWritable = true
try {
  await as(U.owner, `insert into public.membership_units (membership_id, unit_id, org_id) values ($1,$2,$3)`,
    [mem.deptmgr.id, unit.creative.id, org.id])
} catch (e) { unitsWritable = false; console.log(`      (${e.message})`) }
ok('an admin can attach someone to a unit from the app', unitsWritable)

// ---------------------------------------------------------------------------
console.log('\nThe approval chain the brief describes')
// ---------------------------------------------------------------------------

/* "Unit/Line Managers can send approvals to Department managers."
   "Department Managers give final approval of all spending in a department." */

const [raised] = await as(U.eventsOfficer,
  `insert into public.transactions (org_id, budget_line_id, txn_code, txn_type, status, approved_amount, description, created_by)
   values ($1,$2,'TXN-APP','expense','pending',5000,'venue deposit',$3) returning id, status`,
  [org.id, eventsLine.id, U.eventsOfficer.id])
ok('an officer can send spend up for approval', raised?.status === 'pending')

let officerApproved = false
try {
  await as(U.eventsOfficer, `update public.transactions set status = 'approved' where id = $1`, [raised.id])
  officerApproved = true
} catch { /* expected */ }
ok('an officer cannot approve their own request', officerApproved === false)

let leadApproved = false
try {
  await as(U.eventsLead, `update public.transactions set status = 'approved' where id = $1`, [raised.id])
  leadApproved = true
} catch { /* expected */ }
ok('a unit manager cannot approve either — they send it up', leadApproved === false)

let deptApproved = false
try {
  await as(U.deptmgr, `update public.transactions set status = 'approved' where id = $1`, [raised.id])
  deptApproved = true
} catch (e) { console.log(`      (${e.message})`) }
ok('the DEPARTMENT MANAGER gives final approval', deptApproved)

const [after] = await svc(`select status, approved_by from public.transactions where id = $1`, [raised.id])
ok('and is recorded as the approver', after.status === 'approved' && after.approved_by === U.deptmgr.id)

/* A department manager's authority stops at their own department. */
const [dept2] = await svc(
  `insert into public.departments (org_id, name, code) values ($1,'Sales','SLS') returning *`, [org.id])
const [otherLine] = await svc(
  `insert into public.budget_lines (org_id, period_id, department_id, category_id, annual_budget)
   values ($1,$2,$3,$4, 1000000) returning *`, [org.id, period.id, dept2.id, cat.id])
const [otherTxn] = await svc(
  `insert into public.transactions (org_id, budget_line_id, txn_code, txn_type, status, approved_amount, description, created_by)
   values ($1,$2,'TXN-OTHER','expense','pending',1000,'sales spend',$3) returning id`,
  [org.id, otherLine.id, U.owner.id])

/* An UPDATE that RLS filters out affects no rows and raises nothing, so the
   question is what the transaction says afterwards, not whether it threw. */
try {
  await as(U.deptmgr, `update public.transactions set status = 'approved' where id = $1`, [otherTxn.id])
} catch { /* either way, check the row */ }
const [otherAfter] = await svc(`select status from public.transactions where id = $1`, [otherTxn.id])
ok('a department manager CANNOT approve another department\u2019s spend',
   otherAfter.status === 'pending', `(status is now ${otherAfter.status})`)

// ---------------------------------------------------------------------------
console.log('\nWhat each role is offered to filter by')
// ---------------------------------------------------------------------------

/* The dashboard offers whatever the department and unit lists come back with,
   because both are RLS-scoped. So the question worth asking is what each role
   actually gets back — that is the filter they will see. */

const deptsVisible = async (user) =>
  (await as(user, `select name from public.departments order by name`)).map((d) => d.name)
const unitsVisible = async (user) =>
  (await as(user, `select name from public.units order by name`)).map((u) => u.name)

const ownerDepts = await deptsVisible(U.owner)
ok('a super admin is offered every department',
   ownerDepts.includes('Marketing') && ownerDepts.includes('Sales'),
   `(got ${ownerDepts.join(', ')})`)

const mgrDepts = await deptsVisible(U.deptmgr)
ok('a department manager is offered only their own',
   mgrDepts.length === 1 && mgrDepts[0] === 'Marketing', `(got ${mgrDepts.join(', ')})`)

const officerDepts = await deptsVisible(U.eventsOfficer)
ok('a unit officer is offered the department their unit sits in',
   officerDepts.length === 1 && officerDepts[0] === 'Marketing', `(got ${officerDepts.join(', ')})`)

const officerUnits = await unitsVisible(U.eventsOfficer)
ok('and every unit in it, not only their own — the brief grants them the view',
   officerUnits.includes('Events') && officerUnits.includes('Creative Unit') &&
   officerUnits.includes('Sosa Brand'),
   `(got ${officerUnits.join(', ')})`)

const mgrUnits = await unitsVisible(U.deptmgr)
ok('a department manager is offered every unit in their department',
   mgrUnits.length >= 4, `(got ${mgrUnits.length})`)

/* Giving the manager a second department must widen the filter, which is the
   case the old role check got wrong. */
await svc(`insert into public.membership_departments (membership_id, department_id, org_id)
           values ($1, $2, $3)`, [mem.deptmgr.id, dept2.id, org.id])
const widened = await deptsVisible(U.deptmgr)
ok('a department manager running two departments is offered both',
   widened.length === 2, `(got ${widened.join(', ')})`)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
