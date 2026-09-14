// Sending an invitation email.
//
// BudgetFlow has no mail provider of its own — it borrows the Supabase Auth
// mailer that already sends confirmation and password-reset emails. Which
// template goes out depends on whether the address already has an account:
//
//   no account yet  → "Invite user"  (admin.inviteUserByEmail)
//   already signed up → "Magic Link" (signInWithOtp, shouldCreateUser: false)
//
// Both land on /auth/confirm, which signs them in and forwards to the
// invitation's confirm page. Delivery is best-effort: the invitation row is
// already saved, and Settings always shows a copyable link as a fallback.

import { canSendEmail, createAdminClient, createAnonClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { Role } from "@/lib/types"

export interface Delivery {
  sent: boolean
  /** Why nothing was sent, phrased for the admin who pressed the button. */
  reason?: string
}

interface SendOptions {
  email: string
  /** Absolute URL of the confirm page — where the email link ends up. */
  url: string
  orgName: string
  inviterName: string
  role: string
}

/** Supabase reports an address that already has an account in a few shapes. */
function isExistingUser(error: { code?: string; status?: number; message: string }) {
  return (
    error.code === "email_exists" ||
    error.code === "user_already_exists" ||
    /already (been )?registered|already exists/i.test(error.message)
  )
}

function isRateLimited(error: { code?: string; status?: number; message: string }) {
  return error.status === 429 || /rate limit|too many/i.test(error.message)
}

export async function sendInviteEmail({ email, url, orgName, inviterName, role }: SendOptions): Promise<Delivery> {
  if (!canSendEmail) {
    return { sent: false, reason: "Email isn't set up on this deployment (SUPABASE_SERVICE_ROLE_KEY is missing)." }
  }

  // New address: Supabase creates the account and sends the "Invite user" email.
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: url,
    data: { org_name: orgName, invited_by: inviterName, invited_role: role },
  })
  if (!error) return { sent: true }

  if (isRateLimited(error)) {
    return { sent: false, reason: "Supabase is rate-limiting outgoing email. Try again in a minute." }
  }
  if (!isExistingUser(error)) {
    return { sent: false, reason: error.message }
  }

  // Known address: they already have a password, so send a sign-in link instead
  // of an invite (which would fail). Their password is untouched.
  const { error: linkError } = await createAnonClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: url },
  })
  if (!linkError) return { sent: true }
  if (isRateLimited(linkError)) {
    return { sent: false, reason: "Supabase is rate-limiting outgoing email. Try again in a minute." }
  }
  return { sent: false, reason: linkError.message }
}


// -----------------------------------------------------------------------------
// Reading an invitation link
// -----------------------------------------------------------------------------

export type InviteState = "valid" | "expired" | "used" | "not_found"

export interface Invitation {
  state: InviteState
  orgName: string
  role: Role
  /** The address the invitation was sent to. Only this address can accept it. */
  email: string
  expiresAt: string
}

const NOT_FOUND: Invitation = { state: "not_found", orgName: "", role: "viewer", email: "", expiresAt: "" }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What a token points at, readable while signed out. Backed by a SECURITY
 * DEFINER function, so it answers for an exact token and nothing else.
 */
export async function readInvitation(token: string): Promise<Invitation> {
  if (!UUID.test(token)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("invitation_preview", { p_token: token })
  const row = (data as InvitationRow[] | null)?.[0]
  if (error || !row) return NOT_FOUND
  return {
    state: row.invite_state as InviteState,
    orgName: row.org_name,
    role: row.member_role,
    email: row.email,
    expiresAt: row.expires_at,
  }
}

interface InvitationRow {
  invite_state: string
  org_name: string
  member_role: Role
  email: string
  expires_at: string
}
