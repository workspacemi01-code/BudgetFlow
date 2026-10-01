import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

/**
 * The deployment scripts, run exactly as a person would run them.
 *
 * The migrations are already tested; this tests the thing that is actually
 * pasted into the SQL editor. Two specific risks it closes:
 *
 *   · the two steps must be separate transactions — combining them fails on
 *     the enum, and that failure would happen against the real database
 *   · re-running them must be harmless, because someone will double-click,
 *     lose the tab, or wonder whether the first one worked
 */

const BASE = ['0001_init.sql', '0002_service_role_grants.sql', '0003_invitations.sql', '0004_personal_budgets.sql']
  .map((f) => new URL(`../migrations/${f}`, import.meta.url))

const STEP1 = new URL('../../scripts/deploy/1-roles-enum.sql', import.meta.url)
const STEP2 = new URL('../../scripts/deploy/2-scoping-and-views.sql', import.meta.url)

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

console.log('Starting from a database that has only the existing migrations…')
await db.exec(SUPABASE_STUB)
for (const f of BASE) await db.exec(readFileSync(f, 'utf8'))
console.log('  ✓ 0001 → 0004 applied\n')

// ---------------------------------------------------------------------------
console.log('Running the two steps the way the instructions say to')
// ---------------------------------------------------------------------------

let step1Error = null
try { await db.exec(readFileSync(STEP1, 'utf8')) } catch (e) { step1Error = e.message }
ok('step 1 runs', step1Error === null, `(${step1Error})`)

let step2Error = null
try { await db.exec(readFileSync(STEP2, 'utf8')) } catch (e) { step2Error = e.message }
ok('step 2 runs after it', step2Error === null, `(${step2Error})`)

// ---------------------------------------------------------------------------
console.log('\nRe-running them, because somebody will')
// ---------------------------------------------------------------------------

let rerun1 = null
try { await db.exec(readFileSync(STEP1, 'utf8')) } catch (e) { rerun1 = e.message }
ok('step 1 is safe to run twice', rerun1 === null, `(${rerun1})`)

let rerun2 = null
try { await db.exec(readFileSync(STEP2, 'utf8')) } catch (e) { rerun2 = e.message }
ok('step 2 is safe to run twice', rerun2 === null, `(${rerun2})`)

// ---------------------------------------------------------------------------
console.log('\nWhat the verification query checks')
// ---------------------------------------------------------------------------

const q = async (sql) => (await db.query(sql)).rows

const roles = await q(`select r::text as role from unnest(enum_range(null::public.org_role)) r`)
ok('line_manager and officer exist',
   ['line_manager', 'officer'].every((r) => roles.some((x) => x.role === r)),
   `(got: ${roles.map((r) => r.role).join(', ')})`)

const tbl = await q(`select to_regclass('public.membership_brands') is not null as ok`)
ok('membership_brands exists', tbl[0].ok === true)

const col = await q(`select exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='brands' and column_name='officers_can_spend') as ok`)
ok('brands.officers_can_spend exists', col[0].ok === true)

const view = await q(`select to_regclass('public.v_daily_spend') is not null as ok`)
ok('v_daily_spend exists', view[0].ok === true)

const pol = await q(`select with_check from pg_policies
  where schemaname='public' and tablename='transactions' and policyname='transactions_insert'`)
ok('transactions_insert uses the spend rule, not the edit rule',
   String(pol[0]?.with_check ?? '').includes('can_spend_line'),
   `(got: ${pol[0]?.with_check})`)

// ---------------------------------------------------------------------------
console.log('\nNobody loses access when this runs')
// ---------------------------------------------------------------------------

/* The one question an operator actually has about a migration touching
   permissions: does it take anything away from anyone already using it? */
const dflt = await q(`select column_default from information_schema.columns
  where table_schema='public' and table_name='brands' and column_name='officers_can_spend'`)
ok('every existing unit stays open to officers by default',
   String(dflt[0]?.column_default ?? '').includes('true'),
   `(default is: ${dflt[0]?.column_default})`)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
