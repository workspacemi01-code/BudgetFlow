-- =============================================================================
-- BudgetFlow — 0002_service_role_grants.sql
-- Newer Supabase projects no longer grant API roles access to tables created in
-- the SQL editor. 0001 granted `authenticated` explicitly; this gives the
-- server-only service role the same reach so seed / admin scripts can run.
-- `anon` stays locked out on purpose.
-- =============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
