-- Table privileges for the objects 0006 and 0007 created.
--
-- 0001 ends with:
--
--   grant select, insert, update, delete on all tables in schema public to authenticated;
--
-- which reads like a standing rule and is not one. It grants on the tables that
-- exist at that moment; anything created afterwards gets nothing. 0002 was
-- written about this same trap for service_role and still did not make it a
-- default, so every new table has to say so itself.
--
-- The effect was that membership_brands had row-level policies deciding who may
-- read which rows, and no privilege to read the table at all — so every query
-- against it failed with "permission denied for table membership_brands", and
-- the Settings page, which reads a member's units, failed to load entirely.
--
-- Worth noting why the tests missed it: the permission functions are
-- security definer, so they read membership_brands as the definer and were
-- unaffected. Only a query made *as* the signed-in user touches the grant, and
-- nothing exercised that path until the real app did.

grant select, insert, update, delete on public.membership_brands to authenticated;
grant select, insert, update, delete on public.membership_brands to service_role;

grant select on public.v_daily_spend to authenticated;
grant select on public.v_daily_spend to service_role;
