// Who is signed in, which organization they are working in, and their role.
// Everything is read with the user's own session, so RLS decides what they see.

import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import type { Role } from "@/lib/types"

/** Remembers the organization a member of several orgs last switched to. */
export const ORG_COOKIE = "bf_org"

export interface SessionUser {
  id: string
  email: string
  name: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: string
  trial_ends_at: string | null
  currency: string
  fiscal_year_start: number
  brand_label: string
  allow_over_budget: boolean
}

export interface Period {
  id: string
  name: string
  start_date: string
  end_date: string
  status: "open" | "closed"
}

export interface Membership {
  id: string
  role: Role
  org: Organization
  periods: Period[]
  /** Departments this membership is assigned to (dept managers, scoped viewers). */
  departmentIds: string[]
}

export interface OrgContext {
  user: SessionUser
  userName: string
  membership: Membership
  memberships: Membership[]
  org: Organization
  role: Role
  /** The budget period (financial year) being shown — the one containing today, else the latest. */
  period: Period | null
  /** Departments this member is limited to; null means every department. */
  departmentIds: string[] | null
}

export interface PendingInvite {
  id: string
  role: Role
  orgName: string
  /** The token in the invitation email, so the list can link to the confirm page. */
  token: string
}

interface Claims {
  sub?: string
  email?: string
  exp?: number
  user_metadata?: { full_name?: string; name?: string }
}

function decodeClaims(token: string): Claims | null {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as Claims
  } catch {
    return null
  }
}

/**
 * The signed-in user, read from the session cookie without a network round trip.
 * The proxy already verified and refreshed this session for the current request, and
 * Postgres re-verifies the token on every query (RLS), so this only shapes the UI.
 */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getSession()
  const claims = data.session ? decodeClaims(data.session.access_token) : null
  if (!claims?.sub || (claims.exp && claims.exp * 1000 < Date.now())) return null
  const email = claims.email ?? ""
  return {
    id: claims.sub,
    email,
    name: claims.user_metadata?.full_name || claims.user_metadata?.name || email.split("@")[0] || "You",
  }
})

export async function requireUser(): Promise<SessionUser> {
  const user = await getUser()
  if (!user) redirect("/login")
  return user
}

const ORG_COLUMNS = "id, name, slug, plan, trial_ends_at, currency, fiscal_year_start, brand_label, allow_over_budget"

// One query: memberships with their org, the org's budget periods and any department scoping.
const MEMBERSHIP_QUERY = `id, role, membership_departments (department_id),
  org:organizations (${ORG_COLUMNS}, budget_periods (id, name, start_date, end_date, status))`

interface MembershipRow {
  id: string
  role: Role
  membership_departments: { department_id: string }[] | null
  org: Organization & { budget_periods: Period[] | null }
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser()
  if (!user) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .select(MEMBERSHIP_QUERY)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at")
  if (error) throw new Error(error.message)

  return ((data ?? []) as unknown as MembershipRow[]).map(({ id, role, membership_departments, org }) => {
    const { budget_periods, ...orgFields } = org
    return {
      id,
      role,
      org: orgFields,
      periods: (budget_periods ?? []).slice().sort((a, b) => b.start_date.localeCompare(a.start_date)),
      departmentIds: (membership_departments ?? []).map((d) => d.department_id),
    }
  })
})

/** Invitations addressed to the signed-in user's email that they haven't accepted yet. */
export async function getPendingInvites(): Promise<PendingInvite[]> {
  const user = await getUser()
  if (!user?.email) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, invite_token, org:organizations (name)")
    .is("user_id", null)
    .eq("status", "pending")
    .eq("invited_email", user.email.toLowerCase())
    .gt("invite_expires_at", new Date().toISOString())
  if (error) throw new Error(error.message)
  type Row = { id: string; role: Role; invite_token: string; org: { name: string } | null }
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    id: row.id,
    role: row.role,
    orgName: row.org?.name ?? "An organization",
    token: row.invite_token,
  }))
}

function pickPeriod(periods: Period[]): Period | null {
  const today = new Date().toISOString().slice(0, 10)
  return periods.find((p) => p.start_date <= today && today <= p.end_date) ?? periods[0] ?? null
}

/** The signed-in member and their current organization. Sends people without one to onboarding. */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  const user = await requireUser()
  const memberships = await getMemberships()
  if (memberships.length === 0) redirect("/onboarding")

  const chosen = (await cookies()).get(ORG_COOKIE)?.value
  const membership = memberships.find((m) => m.org.id === chosen) ?? memberships[0]
  const limited =
    membership.role === "dept_manager" || (membership.role === "viewer" && membership.departmentIds.length > 0)

  return {
    user,
    userName: user.name,
    membership,
    memberships,
    org: membership.org,
    role: membership.role,
    period: pickPeriod(membership.periods),
    departmentIds: limited ? membership.departmentIds : null,
  }
})
