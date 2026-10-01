-- ============================================================================
--  BudgetFlow — STEP 1 of 2
--
--  Run this first, on its own. Then run step 2.
--
--  These two lines are the whole of step 1, deliberately. Postgres will not
--  let a value added by ALTER TYPE be read or compared in the same transaction
--  that added it — not even by a SELECT checking the values landed. So there
--  is nothing else here; step 2 verifies both of them.
--
--  Safe to re-run. Safe on live data: it only adds enum values, and changes
--  nothing that already exists.
-- ============================================================================

alter type public.org_role add value if not exists 'line_manager';
alter type public.org_role add value if not exists 'officer';
