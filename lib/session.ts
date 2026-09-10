// Who is signed in, which organization they are working in, and their role.
// Everything is read with the user's own session, so RLS decides what they see.

import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"
import type { Role } from "@/lib/types"

/** Remembers the organization a member of several orgs last switched to. */
export const ORG_COOKIE = "bf_org"

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

export interface Membership {
  id: string
  role: Role
  org: Organization
}

export interface Period {
  id: string
  name: string
  start_date: string
  end_date: string
  status: "open" | "closed"
}

export interface OrgContext {
  user: User
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
}

const ORG_COLUMNS = "id, name, slug, plan, trial_ends_at, currency, fiscal_year_start, brand_label, allow_over_budget"

export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
})

export async function requireUser(): Promise<User> {
  const user = await getUser()
  if (!user) redirect("/login")
  return user
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getUser()
  if (!user) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .select(`id, role, org:organizations (${ORG_COLUMNS})`)
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at")
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Membership[]
})

/** Invitations addressed to the signed-in user's email that they haven't accepted yet. */
export async function getPendingInvites(): Promise<PendingInvite[]> {
  const user = await getUser()
  if (!user?.email) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .select("id, role, org:organizations (name)")
    .is("user_id", null)
    .eq("status", "pending")
    .eq("invited_email", user.email.toLowerCase())
  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as { id: string; role: Role; org: { name: string } | null }[]).map((row) => ({
    id: row.id,
    role: row.role,
    orgName: row.org?.name ?? "An organization",
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
  const supabase = await createClient()

  const [periods, profile, scopes] = await Promise.all([
    supabase
      .from("budget_periods")
      .select("id, name, start_date, end_date, status")
      .eq("org_id", membership.org.id)
      .order("start_date", { ascending: false }),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("membership_departments").select("department_id").eq("membership_id", membership.id),
  ])
  if (periods.error) throw new Error(periods.error.message)
  if (profile.error) throw new Error(profile.error.message)
  if (scopes.error) throw new Error(scopes.error.message)

  const departmentIds = (scopes.data ?? []).map((s) => s.department_id as string)
  const limited = membership.role === "dept_manager" || (membership.role === "viewer" && departmentIds.length > 0)

  return {
    user,
    userName: (profile.data?.full_name as string | null) || user.email?.split("@")[0] || "You",
    membership,
    memberships,
    org: membership.org,
    role: membership.role,
    period: pickPeriod((periods.data ?? []) as Period[]),
    departmentIds: limited ? departmentIds : null,
  }
})
