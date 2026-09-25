import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const MIGRATIONS = [
  new URL('../migrations/0001_init.sql', import.meta.url),
  new URL('../migrations/0002_service_role_grants.sql', import.meta.url),
  new URL('../migrations/0003_invitations.sql', import.meta.url),
  new URL('../migrations/0004_personal_budgets.sql', import.meta.url),
]

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
  ada:  { id: '11111111-1111-1111-1111-111111111111', email: 'ada@personal.test' },
  bode: { id: '22222222-2222-2222-2222-222222222222', email: 'bode@personal.test' },
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
const money = (v) => Number(v)

console.log('Applying migrations…')
await db.exec(SUPABASE_STUB)
for (const file of MIGRATIONS) await db.exec(readFileSync(file, 'utf8'))
console.log('  ✓ 0001 → 0004 applied cleanly\n')

for (const u of Object.values(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [u.id, u.email, { full_name: u.email.split('@')[0] }])

// ---------------------------------------------------------------------------
console.log('Starting a budget')
// ---------------------------------------------------------------------------

const oct = await one(U.ada,
  `select public.start_personal_budget('monthly', date '2026-10-14') as id`)
const budget = await one(U.ada, `select * from public.personal_budgets where id = $1`, [oct.id])

ok('a monthly budget snaps to the first of the month', budget.start_date.toISOString().slice(0, 10) === '2026-10-01')
ok('and ends on the last day', budget.end_date.toISOString().slice(0, 10) === '2026-10-31')
ok('and is named for the month', budget.name === 'October 2026', `(got: ${budget.name})`)

const starterLines = await as(U.ada, `select name from public.personal_lines where budget_id = $1 order by position`, [oct.id])
ok('it arrives with starting lines, not an empty screen',
  starterLines.map((l) => l.name).join(',') === 'Rent,Food,Transport,Savings',
  `(got: ${starterLines.map((l) => l.name).join(',')})`)

const profile = await one(U.ada, `select * from public.personal_profiles where user_id = $1`, [U.ada.id])
ok('the individual account itself is created', !!profile)

// Pressing the button twice is a person, not a script — it must not blow up.
const again = await one(U.ada, `select public.start_personal_budget('monthly', date '2026-10-27') as id`)
ok('starting the same month twice returns the same budget', again.id === oct.id)

const yearly = await one(U.ada, `select public.start_personal_budget('yearly', date '2026-10-14') as id`)
const yearlyRow = await one(U.ada, `select * from public.personal_budgets where id = $1`, [yearly.id])
ok('a yearly budget covers the whole year', yearlyRow.start_date.toISOString().slice(0, 10) === '2026-01-01'
  && yearlyRow.end_date.toISOString().slice(0, 10) === '2026-12-31')
ok('and is named for the year', yearlyRow.name === '2026', `(got: ${yearlyRow.name})`)
ok('monthly and yearly for the same period coexist', yearly.id !== oct.id)

// ---------------------------------------------------------------------------
console.log('\nSpending against it')
// ---------------------------------------------------------------------------

const rent = await one(U.ada,
  `update public.personal_lines set planned = 200000 where budget_id = $1 and name = 'Rent' returning *`, [oct.id])
ok('money can be set aside on a line', money(rent.planned) === 200000)

await as(U.ada, `insert into public.personal_entries (line_id, user_id, description, amount, paid_at)
                 values ($1, $2, 'October rent', 150000, now())`, [rent.id, U.ada.id])
await as(U.ada, `insert into public.personal_entries (line_id, user_id, description, amount)
                 values ($1, $2, 'Service charge', 20000)`, [rent.id, U.ada.id])

const rentTotals = await one(U.ada, `select * from public.v_personal_lines where id = $1`, [rent.id])
ok('paid money counts as spent', money(rentTotals.spent) === 150000)
ok('unpaid money is upcoming, not spent', money(rentTotals.upcoming) === 20000)
ok('both count against the budget', money(rentTotals.committed) === 170000)
ok('remaining is what is left', money(rentTotals.remaining) === 30000)

// The pay button.
await as(U.ada, `update public.personal_entries set paid_at = now()
                 where line_id = $1 and paid_at is null`, [rent.id])
const afterPay = await one(U.ada, `select * from public.v_personal_lines where id = $1`, [rent.id])
ok('marking it paid moves it from upcoming to spent',
  money(afterPay.spent) === 170000 && money(afterPay.upcoming) === 0)
ok('and does not change what is left', money(afterPay.remaining) === 30000)

// ---------------------------------------------------------------------------
console.log('\nGoing over')
// ---------------------------------------------------------------------------

const food = await one(U.ada,
  `update public.personal_lines set planned = 50000 where budget_id = $1 and name = 'Food' returning *`, [oct.id])
await as(U.ada, `insert into public.personal_entries (line_id, user_id, amount, paid_at)
                 values ($1, $2, 62000, now())`, [food.id, U.ada.id])

const overspent = await one(U.ada, `select * from public.v_personal_lines where id = $1`, [food.id])
// The whole reason someone opens the app. Clamping this at zero would hide it.
ok('overspending shows as a negative remaining', money(overspent.remaining) === -12000,
  `(got: ${overspent.remaining})`)

// ---------------------------------------------------------------------------
console.log('\nOne person cannot see or touch another')
// ---------------------------------------------------------------------------

const bodeSees = await as(U.bode, `select * from public.personal_budgets`)
ok("another person's budgets are invisible", bodeSees.length === 0)

const bodeLines = await as(U.bode, `select * from public.v_personal_lines`)
ok("and so are their lines and totals", bodeLines.length === 0)

await expectError("and cannot be written to", () =>
  as(U.bode, `insert into public.personal_lines (budget_id, user_id, name)
              values ($1, $2, 'Sneaked in')`, [oct.id, U.bode.id]))

// Claiming your own user_id on someone else's budget: the composite foreign key
// is what stops this, not the policy.
await expectError("and a line cannot be smuggled onto someone else's budget", () =>
  as(U.bode, `insert into public.personal_lines (budget_id, user_id, name)
              values ($1, $2, 'Mine now')`, [oct.id, U.bode.id]),
  'foreign key')

await as(U.bode, `update public.personal_lines set planned = 1 where id = $1`, [rent.id])
const untouched = await one(U.ada, `select planned from public.personal_lines where id = $1`, [rent.id])
ok("an update by someone else changes nothing", money(untouched.planned) === 200000)

// ---------------------------------------------------------------------------
console.log('\nHousekeeping')
// ---------------------------------------------------------------------------

await expectError('the same envelope cannot be added twice, whatever the casing', () =>
  as(U.ada, `insert into public.personal_lines (budget_id, user_id, name) values ($1, $2, 'rent')`,
    [oct.id, U.ada.id]),
  'duplicate key')

await expectError('a spend of zero is not a spend', () =>
  as(U.ada, `insert into public.personal_entries (line_id, user_id, amount) values ($1, $2, 0)`,
    [rent.id, U.ada.id]))

await as(U.ada, `delete from public.personal_budgets where id = $1`, [oct.id])
const orphans = await as(U.ada, `select * from public.personal_entries where line_id = $1`, [rent.id])
ok('deleting a budget takes its lines and entries with it', orphans.length === 0)

// ---------------------------------------------------------------------------
console.log('\nThe business side is untouched')
// ---------------------------------------------------------------------------

const org = await one(U.ada, `select * from public.create_organization('Acme Ltd', 'acme', 'NGN', 1)`)
ok('organizations still work exactly as before', !!org?.id)
const stillThere = await one(U.ada, `select count(*)::int as n from public.brands`)
ok('and the brands table is still there, as asked', Number(stillThere.n) === 0)

console.log(`\n${passed} passed, ${failed} failed`)
await db.close()
process.exit(failed ? 1 : 0)
