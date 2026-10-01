-- Department managers give final approval for their own department.
--
-- The brief is explicit about the chain:
--
--   Unit/Line Managers  "can send approvals to Department managers"
--   Department Managers "give final approval of all spending in a department"
--
-- The trigger said:
--
--   if new.status in ('approved', 'rejected')
--      and v_role not in ('owner', 'admin', 'finance') then
--     raise exception 'Only owners, admins and finance can approve or reject';
--
-- so a department manager could raise spend and then wait for head office to
-- approve it — the one thing their role exists to do, refused. Sending an
-- approval upward already worked, because submitting is just moving a
-- transaction to 'pending'; it was the receiving end that was missing.
--
-- Approval is now scoped the way viewing and editing already are: a department
-- manager approves what belongs to their departments, and nothing else. Owners,
-- admins and finance are unchanged and still approve anywhere.

create or replace function private.can_approve_line(p_line uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select case
      when m.role in ('owner', 'admin', 'finance') then true
      /* Final approval for their own department, every unit and brand inside
         it. Deliberately the department, not the unit: a unit manager sends
         the request up precisely because the decision is not theirs. */
      when m.role = 'dept_manager' then exists (
        select 1 from public.membership_departments md
        where md.membership_id = m.id and md.department_id = bl.department_id)
      else false
    end
    from public.budget_lines bl
    join public.memberships m
      on m.org_id = bl.org_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
    where bl.id = p_line
  ), false)
$$;

grant execute on function private.can_approve_line(uuid) to authenticated;



-- The trigger below is 0001's guard_transaction, verbatim, with that single
-- condition swapped. Taken from the original rather than retyped: a first
-- attempt at rewriting it from memory silently lost the closed-period check,
-- the org_id immutability check and the service-role bypass. A diff against
-- 0001 caught it. Nothing else here differs.

create or replace function private.guard_transaction()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid         uuid := auth.uid();
  v_role        public.org_role;
  v_paid        numeric(18, 2);
  v_derived     public.txn_status;
  v_available   numeric;
  v_allow_over  boolean;
begin
  if tg_op = 'UPDATE' and new.org_id <> old.org_id then
    raise exception 'org_id is immutable';
  end if;
  if v_uid is null then
    return new;  -- trusted server-side context
  end if;

  v_role := private.org_role(new.org_id);
  if v_role is null then
    raise exception 'Not a member of this organization' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.budget_lines bl
    join public.budget_periods bp on bp.id = bl.period_id
    where bl.id = new.budget_line_id and bp.status = 'closed') then
    raise exception 'Budget period is closed';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'pending') then
      raise exception 'New transactions must start as draft or pending';
    end if;
    if new.txn_type = 'adjustment' and v_role not in ('owner', 'admin', 'finance') then
      raise exception 'Only finance can record adjustments' using errcode = '42501';
    end if;
    new.created_by   := v_uid;
    new.submitted_at := case when new.status = 'pending' then now() end;
    new.over_budget  := false;
    new.approved_by  := null;  new.approved_at := null;
    new.rejected_by  := null;  new.rejected_at := null;  new.rejection_reason := null;
    new.voided_by    := null;  new.voided_at   := null;  new.void_reason      := null;
    return new;
  end if;

  -- UPDATE
  if old.status = 'voided' then
    raise exception 'Voided transactions cannot be changed';
  end if;
  if new.txn_code <> old.txn_code or new.created_by is distinct from old.created_by then
    raise exception 'txn_code and created_by are immutable';
  end if;
  if old.status not in ('draft', 'pending', 'rejected')
     and (new.budget_line_id, new.approved_amount, new.txn_type)
         is distinct from (old.budget_line_id, old.approved_amount, old.txn_type) then
    raise exception 'Amount and budget line are locked once approved; void and re-create instead';
  end if;

  -- System-managed columns are only changed by the transitions below.
  new.submitted_at := old.submitted_at;
  new.over_budget  := old.over_budget;
  new.approved_by  := old.approved_by;  new.approved_at := old.approved_at;
  new.rejected_by  := old.rejected_by;  new.rejected_at := old.rejected_at;
  new.voided_by    := old.voided_by;    new.voided_at   := old.voided_at;
  if new.status = old.status then
    new.rejection_reason := old.rejection_reason;
    new.void_reason      := old.void_reason;
    return new;
  end if;

  select coalesce(sum(p.amount), 0) into v_paid
  from public.payments p
  where p.transaction_id = new.id and p.voided_at is null;

  if old.status in ('approved', 'partially_paid', 'paid')
     and new.status in ('approved', 'partially_paid', 'paid') then
    v_derived := case
      when v_paid = 0 then 'approved'::public.txn_status
      when v_paid = old.approved_amount then 'paid'::public.txn_status
      else 'partially_paid'::public.txn_status
    end;
    if new.status <> v_derived then
      raise exception 'Payment status is derived from payments; record or void a payment instead';
    end if;
    return new;
  end if;

  if not (
       (old.status = 'draft'    and new.status in ('pending', 'voided'))
    or (old.status = 'pending'  and new.status in ('draft', 'approved', 'rejected', 'voided'))
    or (old.status = 'rejected' and new.status in ('draft', 'pending', 'voided'))
    or (old.status = 'approved' and new.status = 'voided')
  ) then
    raise exception 'Invalid status change from % to %', old.status, new.status;
  end if;

  /* The one change from 0001: who may decide, rather than which three roles.
     A department manager gives final approval for their own department, which
     is the role's whole purpose and was refused here. */
  if new.status in ('approved', 'rejected') and not private.can_approve_line(new.budget_line_id) then
    raise exception 'Only an approver, or the manager of this department, can approve or reject'
      using errcode = '42501';
  end if;

  case new.status
    when 'pending' then
      new.submitted_at := now();
    when 'draft' then
      new.submitted_at := null;
    when 'rejected' then
      new.rejected_by := v_uid;
      new.rejected_at := now();
    when 'voided' then
      if v_paid <> 0 then
        raise exception 'Void this transaction''s payments first, or record an adjustment';
      end if;
      if v_role not in ('owner', 'admin', 'finance')
         and not (old.status in ('draft', 'pending', 'rejected') and old.created_by = v_uid) then
        raise exception 'You can only void your own unapproved transactions' using errcode = '42501';
      end if;
      if coalesce(btrim(new.void_reason), '') = '' then
        raise exception 'A reason is required to void a transaction';
      end if;
      new.voided_by := v_uid;
      new.voided_at := now();
    when 'approved' then
      new.approved_by := v_uid;
      new.approved_at := now();
      if new.approved_amount > 0 then
        -- Serialise approvals and transfers on this line.
        perform 1 from public.budget_lines bl where bl.id = new.budget_line_id for update;
        v_available := private.line_available(new.budget_line_id);
        if new.approved_amount > v_available then
          select o.allow_over_budget into v_allow_over from public.organizations o where o.id = new.org_id;
          if not v_allow_over then
            raise exception 'Over budget: % available on this line, % requested', v_available, new.approved_amount;
          end if;
          if v_role not in ('owner', 'admin') then
            raise exception 'Over-budget approval requires an owner or admin' using errcode = '42501';
          end if;
          new.over_budget := true;
        end if;
      end if;
    else
      null;
  end case;
  return new;
end;
$$;
