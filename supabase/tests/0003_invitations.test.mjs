// Invitation links: who may read one, who may accept one, and when it stops working.
// Run with: npx --yes --package @electric-sql/pglite node supabase/tests/0003_invitations.test.mjs

import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'

const MIGRATIONS = ['0001_init.sql', '0003_invitations.sql'].map(
  (name) => new URL(`../migrations/${name}`, import.meta.url)
)

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
  owner:    { id: '11111111-1111-1111-1111-111111111111', email: 'owner@acme.test' },
  finance:  { id: '22222222-2222-2222-2222-222222222222', email: 'finance@acme.test' },
  manager:  { id: '33333333-3333-3333-3333-333333333333', email: 'manager@acme.test' },
  outsider: { id: '55555555-5555-5555-5555-555555555555', email: 'boss@other.test' },
}

async function as(user, sql, params = []) {
  await db.exec(`set role authenticated;
    select set_config('request.jwt.claims', '${JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated' })}', false);`)
  try { return (await db.query(sql, params)).rows }
  finally { await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`) }
}

/** Signed out: the anon role with no JWT, which is how the confirm page loads. */
async function asAnon(sql, params = []) {
  await db.exec(`set role anon; select set_config('request.jwt.claims', '', false);`)
  try { return (await db.query(sql, params)).rows }
  finally { await db.exec(`reset role;`) }
}

async function expectError(label, fn, fragment) {
  try { await fn(); ok(label, false, '(expected an error, got none)') }
  catch (e) { ok(label, !fragment || e.message.includes(fragment), `(got: ${e.message})`) }
}
const one = async (...a) => (await as(...a))[0]

console.log('Applying migrations…')
await db.exec(SUPABASE_STUB)
for (const file of MIGRATIONS) await db.exec(readFileSync(file, 'utf8'))
console.log('  ✓ 0001 + 0003 applied cleanly\n')

for (const u of Object.values(U))
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
    [u.id, u.email, { full_name: u.email.split('@')[0] }])

const org = await one(U.owner, `select * from public.create_organization('Acme Ltd', 'acme', 'NGN', 1)`)
const invite = async (email, role) =>
  one(U.owner, `insert into public.memberships (org_id, invited_email, role) values ($1, $2, $3)
                returning id, invite_token, invite_expires_at`, [org.id, email, role])

console.log('Every invitation gets a link')
const invFinance = await invite(U.finance.email, 'finance')
ok('a token is generated on insert', !!invFinance.invite_token)
ok('it expires in about 7 days',
  Math.round((new Date(invFinance.invite_expires_at) - Date.now()) / 86400000) === 7)
ok('tokens are unique',
  (await as(U.owner, `select count(distinct invite_token)::int n from public.memberships`))[0].n ===
  (await as(U.owner, `select count(*)::int n from public.memberships`))[0].n)

console.log('\nReading a link while signed out')
const preview = (await asAnon(`select * from public.invitation_preview($1)`, [invFinance.invite_token]))[0]
ok('anon can preview a valid token', preview?.invite_state === 'valid', JSON.stringify(preview))
ok('preview names the org and role', preview?.org_name === 'Acme Ltd' && preview?.member_role === 'finance')
ok('preview names the address it was sent to', preview?.email === U.finance.email)
ok('an unknown token previews as nothing',
  (await asAnon(`select * from public.invitation_preview(gen_random_uuid())`)).length === 0)
ok('anon still cannot read memberships directly',
  (await asAnon(`select count(*)::int n from public.memberships`).catch(() => [{ n: 0 }]))[0].n === 0)

console.log('\nAccepting is bound to the invited address')
await expectError('someone else cannot accept the link',
  () => as(U.outsider, `select public.accept_invitation_by_token($1)`, [invFinance.invite_token]), 'not valid')
const accepted = await one(U.finance, `select * from public.accept_invitation_by_token($1)`, [invFinance.invite_token])
ok('the invited address joins', accepted.status === 'active' && accepted.user_id === U.finance.id)
ok('accepting a second time is harmless',
  (await one(U.finance, `select * from public.accept_invitation_by_token($1)`, [invFinance.invite_token])).status === 'active')
ok('the link now previews as used',
  (await asAnon(`select * from public.invitation_preview($1)`, [invFinance.invite_token]))[0].invite_state === 'used')

console.log('\nExpiry')
const invManager = await invite(U.manager.email, 'dept_manager')
await db.query(`update public.memberships set invite_expires_at = now() - interval '1 day' where id = $1`, [invManager.id])
ok('an old link previews as expired',
  (await asAnon(`select * from public.invitation_preview($1)`, [invManager.invite_token]))[0].invite_state === 'expired')
await expectError('an expired link cannot be accepted by token',
  () => as(U.manager, `select public.accept_invitation_by_token($1)`, [invManager.invite_token]), 'expired')
await expectError('an expired invitation cannot be accepted by id either',
  () => as(U.manager, `select public.accept_invitation($1)`, [invManager.id]), 'expired')

console.log('\nResending')
await as(U.owner, `update public.memberships set invited_at = now(), invite_expires_at = now() + interval '7 days' where id = $1`, [invManager.id])
ok('an admin can give the link another 7 days',
  (await asAnon(`select * from public.invitation_preview($1)`, [invManager.invite_token]))[0].invite_state === 'valid')
await as(U.manager, `select public.accept_invitation_by_token($1)`, [invManager.invite_token])
ok('the refreshed link works',
  (await as(U.owner, `select count(*)::int n from public.memberships where status = 'active'`))[0].n === 3)

console.log('\nThe token cannot be tampered with')
const invOutsider = await invite(U.outsider.email, 'viewer')
await expectError('the invitee cannot rewrite the token as they accept', () =>
  as(U.outsider, `update public.memberships set user_id = $1, status = 'active', invite_token = gen_random_uuid() where id = $2`,
    [U.outsider.id, invOutsider.id]), 'Invalid invitation acceptance')
await expectError('the invitee cannot promote themselves as they accept', () =>
  as(U.outsider, `update public.memberships set user_id = $1, status = 'active', role = 'owner' where id = $2`,
    [U.outsider.id, invOutsider.id]), 'Invalid invitation acceptance')
ok('a stranger silently sees no rows to update rather than an error',
  (await as(U.finance, `update public.memberships set user_id = $1, status = 'active' where id = $2 returning id`,
    [U.finance.id, invOutsider.id])).length === 0)
ok('the invitation is untouched',
  (await asAnon(`select * from public.invitation_preview($1)`, [invOutsider.invite_token]))[0].invite_state === 'valid')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
