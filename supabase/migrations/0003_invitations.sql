-- =============================================================================
-- BudgetFlow — 0003_invitations.sql
-- Makes an invitation something you can *send*: every pending membership now
-- carries a secret token and an expiry, so an email can link straight to
-- /invite/<token>.
--
-- Rules this adds:
--   * A token is only usable while the membership is still pending and unclaimed.
--   * A token is bound to the address it was sent to — accepting requires the
--     caller's JWT email to match invited_email (enforced by the existing
--     guard_membership trigger, which we extend with an expiry check).
--   * Anyone holding a token may read a small preview (org name, role, the
--     address it was sent to) while signed out, so the confirm page can render
--     before sign-up. Nothing else about the org is exposed.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------

alter table public.memberships
  add column invite_token      uuid        not null default gen_random_uuid(),
  add column invited_at        timestamptz not null default now(),
  add column invite_expires_at timestamptz not null default (now() + interval '7 days');

create unique index memberships_invite_token_key on public.memberships (invite_token);

comment on column public.memberships.invite_token is
  'Secret in the invitation link. Only usable while status = pending and user_id is null.';
comment on column public.memberships.invited_at is
  'When the invitation was last sent. Resending refreshes this and invite_expires_at.';


-- -----------------------------------------------------------------------------
-- 2. Guard: expiry is enforced in the database, and the token is immutable
-- -----------------------------------------------------------------------------
-- Same body as 0001 with two additions on the "invitee accepting" branch:
-- the invitation must not have expired, and invite_token may not be rewritten.

create or replace function private.guard_membership()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_role public.org_role;
begin
  if v_uid is null then
    return coalesce(new, old);
  end if;
  v_role := private.org_role(coalesce(new.org_id, old.org_id));

  if tg_op = 'INSERT' then
    -- Founder: the org creator's first (owner) membership.
    if new.user_id = v_uid and new.role = 'owner' and new.status = 'active'
       and exists (select 1 from public.organizations o where o.id = new.org_id and o.created_by = v_uid)
       and not exists (select 1 from public.memberships m where m.org_id = new.org_id) then
      return new;
    end if;
    if not coalesce(v_role in ('owner', 'admin'), false) then
      raise exception 'Only owners and admins can invite members' using errcode = '42501';
    end if;
    if new.invited_email is null or btrim(new.invited_email) = '' then
      raise exception 'invited_email is required';
    end if;
    if new.role = 'owner' and v_role <> 'owner' then
      raise exception 'Only owners can invite owners' using errcode = '42501';
    end if;
    new.invited_email := lower(btrim(new.invited_email));
    new.user_id       := null;
    new.status        := 'pending';
    new.invited_by    := v_uid;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Invitee accepting their own invitation.
    if old.user_id is null and new.user_id = v_uid then
      if old.status <> 'pending' or new.status <> 'active'
         or old.invited_email is distinct from lower((select auth.jwt()) ->> 'email')
         or (new.org_id, new.role, new.invited_email, new.invited_by, new.invite_token)
            is distinct from (old.org_id, old.role, old.invited_email, old.invited_by, old.invite_token) then
        raise exception 'Invalid invitation acceptance' using errcode = '42501';
      end if;
      if old.invite_expires_at < now() then
        raise exception 'This invitation has expired. Ask an owner or admin to send a new one.'
          using errcode = '22023';
      end if;
      return new;
    end if;
    if not coalesce(v_role in ('owner', 'admin'), false) then
      raise exception 'Only owners and admins can change memberships' using errcode = '42501';
    end if;
    if (new.org_id, new.user_id, new.invited_email, new.invited_by)
       is distinct from (old.org_id, old.user_id, old.invited_email, old.invited_by) then
      raise exception 'org, user and invitation fields are immutable';
    end if;
    if v_role = 'admin' and (old.role = 'owner' or new.role = 'owner') then
      raise exception 'Only owners can change owner memberships' using errcode = '42501';
    end if;
    if old.user_id = v_uid and new.role <> old.role then
      raise exception 'You cannot change your own role';
    end if;
    if old.status = 'pending' and new.status <> 'pending' then
      raise exception 'Pending invitations are activated by the invitee';
    end if;
    return new;
  end if;

  -- DELETE: members may leave; owners/admins may remove others.
  if old.user_id = v_uid
     or (old.user_id is null and old.invited_email = lower((select auth.jwt()) ->> 'email')) then
    return old;
  end if;
  if not coalesce(v_role in ('owner', 'admin'), false) then
    raise exception 'Only owners and admins can remove members' using errcode = '42501';
  end if;
  if v_role = 'admin' and old.role = 'owner' then
    raise exception 'Only owners can remove owners' using errcode = '42501';
  end if;
  return old;
end;
$$;


-- -----------------------------------------------------------------------------
-- 3. Reading an invitation before you have an account
-- -----------------------------------------------------------------------------
-- The confirm page has to render for a signed-out visitor, so this is the one
-- function `anon` may call. It answers only for an exact token and returns
-- nothing else about the organization.

create function public.invitation_preview(p_token uuid)
returns table (
  invite_state text,
  org_name     text,
  member_role  public.org_role,
  email        text,
  expires_at   timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select
    case
      when m.user_id is not null or m.status <> 'pending' then 'used'
      when m.invite_expires_at < now()                    then 'expired'
      else 'valid'
    end,
    o.name,
    m.role,
    m.invited_email,
    m.invite_expires_at
  from public.memberships m
  join public.organizations o on o.id = m.org_id
  where m.invite_token = p_token
$$;

comment on function public.invitation_preview(uuid) is
  'What an invitation link points at. Callable while signed out; the token is the secret.';


-- -----------------------------------------------------------------------------
-- 4. Accepting by token
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: RLS already limits a pending membership to the
-- address it was sent to, and guard_membership re-checks the JWT email and the
-- expiry. The token narrows *which* invitation, never *whether* it is allowed.

create function public.accept_invitation_by_token(p_token uuid)
returns public.memberships
language plpgsql security invoker set search_path = ''
as $$
declare
  v_membership public.memberships;
  v_org        uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select m.org_id into v_org from public.memberships m where m.invite_token = p_token;
  if v_org is null then
    raise exception 'This invitation link is not valid.';
  end if;

  -- Already in, so a second click (or a stale tab) is harmless rather than an error.
  select m.* into v_membership
  from public.memberships m
  where m.org_id = v_org and m.user_id = (select auth.uid()) and m.status = 'active';
  if v_membership.id is not null then
    return v_membership;
  end if;

  update public.memberships
  set user_id = (select auth.uid()), status = 'active'
  where invite_token = p_token and user_id is null and status = 'pending'
  returning * into v_membership;

  if v_membership.id is null then
    raise exception 'This invitation has already been used.';
  end if;
  return v_membership;
end;
$$;


-- -----------------------------------------------------------------------------
-- 5. Grants
-- -----------------------------------------------------------------------------

revoke execute on function public.invitation_preview(uuid) from public;
grant  execute on function public.invitation_preview(uuid) to anon, authenticated;

revoke execute on function public.accept_invitation_by_token(uuid) from public, anon;
grant  execute on function public.accept_invitation_by_token(uuid) to authenticated;

grant execute on function public.invitation_preview(uuid)          to service_role;
grant execute on function public.accept_invitation_by_token(uuid)  to service_role;
