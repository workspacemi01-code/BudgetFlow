-- Spend by day, by unit.
--
-- v_monthly_summary is grouped by month and carries no brand, so it cannot
-- answer either half of what the dashboard now needs: a week view, and a
-- filter down to a single unit. Rather than add a second monthly view beside
-- it, this groups one level finer than the finest thing asked for — by day —
-- and the application folds days into weeks, months or years.
--
-- Grouping by day rather than returning raw transactions matters: a year of a
-- department's spend is thousands of rows, and the dashboard was already slow.
-- Distinct (department, unit, day) is a few hundred at most.
--
-- security_invoker, like every other view here, so a line manager sees exactly
-- the units their membership allows and no more.

create or replace view public.v_daily_spend
with (security_invoker = true)
as
select
  t.org_id,
  t.period_id,
  t.department_id,
  t.department_name,
  t.brand_id,
  t.brand_name,
  t.txn_date::date                           as day,
  count(*)                                   as transaction_count,
  sum(t.spent_amount)::numeric(18, 2)        as spent,
  sum(t.committed_amount)::numeric(18, 2)    as committed
from public.v_transactions t
where t.status not in ('draft', 'rejected', 'voided')
group by
  t.org_id, t.period_id, t.department_id, t.department_name,
  t.brand_id, t.brand_name, t.txn_date::date;

comment on view public.v_daily_spend is
  'Spend and commitment per day per unit. The dashboard folds these into weeks, months or years.';

grant select on public.v_daily_spend to authenticated;
