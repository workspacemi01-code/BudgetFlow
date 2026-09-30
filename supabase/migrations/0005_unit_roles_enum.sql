-- Unit-level roles, part one: the enum values.
--
-- These live in their own migration because Postgres will not let a value added
-- by ALTER TYPE be used in the same transaction that added it, and 0006
-- compares against both of them.
--
--   line_manager  a Unit/Line Manager. Edits their own unit, views the rest of
--                 the department read-only, sends approvals upward.
--   officer       spends within their own units. Never edits a budget, and is
--                 blocked from any unit marked as closed to officers.

alter type public.org_role add value if not exists 'line_manager';
alter type public.org_role add value if not exists 'officer';
