"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { CURRENCIES } from "@/lib/format"
import { sendInviteEmail } from "@/lib/invites"
import { ROLE_LABELS, invitableRoles, isAdmin } from "@/lib/roles"
import { ORG_COOKIE, getMemberships, requireOrg, requireUser } from "@/lib/session"
import { inviteUrl, safePath, siteOrigin } from "@/lib/site"
import { createClient } from "@/lib/supabase/server"
import type { FormState, Role } from "@/lib/types"

const YEAR = 60 * 60 * 24 * 365
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000

async function rememberOrg(orgId: string) {
  ;(await cookies()).set(ORG_COOKIE, orgId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: YEAR })
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "")
  return `${base || "org"}-${Math.random().toString(36).slice(2, 6)}`
}

export async function switchOrg(orgId: string) {
  const memberships = await getMemberships()
  if (!memberships.some((m) => m.org.id === orgId)) return
  await rememberOrg(orgId)
  redirect("/dashboard")
}

export async function createOrganization(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const name = String(formData.get("name") ?? "").trim()
  const currency = String(formData.get("currency") ?? "")
  const fyStart = Number(formData.get("fyStart"))
  if (name.length < 2) return { error: "Enter your organization's name." }
  if (!CURRENCIES.some((c) => c.code === currency)) return { error: "Pick a currency." }
  if (!Number.isInteger(fyStart) || fyStart < 1 || fyStart > 12) return { error: "Pick the month your financial year starts." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: name,
    p_slug: slugify(name),
    p_currency: currency,
    p_fiscal_year_start: fyStart,
  })
  if (error) return { error: error.message }
  await rememberOrg((data as { id: string }).id)
  redirect("/dashboard")
}

export async function updateOrganization(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isAdmin(ctx.role)) return { error: "Only owners and admins can change organization settings." }

  const name = String(formData.get("name") ?? "").trim()
  const currency = String(formData.get("currency") ?? "")
  const brandLabel = String(formData.get("brandLabel") ?? "").trim()
  if (name.length < 2) return { error: "Enter the organization's name." }
  if (!CURRENCIES.some((c) => c.code === currency)) return { error: "Pick a currency." }
  if (brandLabel.length < 1 || brandLabel.length > 40) return { error: "Enter a label such as Brand, Project or Cost center." }

  const supabase = await createClient()
  const { error } = await supabase
    .from("organizations")
    .update({ name, currency, brand_label: brandLabel, allow_over_budget: formData.get("allowOverBudget") === "on" })
    .eq("id", ctx.org.id)
  if (error) return { error: error.message }
  revalidatePath("/", "layout")
  return { message: "Saved." }
}

export async function inviteMember(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isAdmin(ctx.role)) return { error: "Only owners and admins can invite people." }

  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const role = String(formData.get("role") ?? "") as Role
  const departmentIds = formData.getAll("departmentIds").map(String)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  if (!invitableRoles(ctx.role).includes(role)) return { error: "Pick a role." }
  if (role === "dept_manager" && departmentIds.length === 0) {
    return { error: "Pick at least one department for a department manager." }
  }
  if (email === ctx.user.email.toLowerCase()) return { error: "You're already a member of this organization." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .insert({ org_id: ctx.org.id, invited_email: email, role })
    .select("id, invite_token")
    .single()
  if (error) {
    return { error: error.code === "23505" ? await describeDuplicate(ctx.org.id, email) : error.message }
  }

  const scoped = role === "dept_manager" || role === "viewer" ? departmentIds : []
  if (scoped.length > 0) {
    const { error: scopeError } = await supabase
      .from("membership_departments")
      .insert(scoped.map((department_id) => ({ membership_id: data.id, department_id, org_id: ctx.org.id })))
    if (scopeError) return { error: scopeError.message }
  }

  const url = inviteUrl(await siteOrigin(), String(data.invite_token))
  const delivery = await sendInviteEmail({
    email,
    url,
    orgName: ctx.org.name,
    inviterName: ctx.userName,
    role: ROLE_LABELS[role],
  })
  revalidatePath("/settings")
  return delivery.sent
    ? { message: `Invitation sent to ${email}. The link works for 7 days.`, inviteUrl: url }
    : { warning: `${email} is invited, but the email didn't go out — ${delivery.reason} Send them this link instead.`, inviteUrl: url }
}

/** Tells an admin why a repeat invitation was rejected — already in, or already invited. */
async function describeDuplicate(orgId: string, email: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from("memberships")
    .select("status")
    .eq("org_id", orgId)
    .eq("invited_email", email)
    .maybeSingle()
  return data?.status === "active"
    ? `${email} is already a member of this organization.`
    : `${email} has already been invited. Use Resend to send the link again.`
}

/** Sends the invitation again and gives it another 7 days. */
export async function resendInvite(membershipId: string): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isAdmin(ctx.role)) return { error: "Only owners and admins can invite people." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .update({ invited_at: new Date().toISOString(), invite_expires_at: new Date(Date.now() + SEVEN_DAYS).toISOString() })
    .eq("id", membershipId)
    .eq("org_id", ctx.org.id)
    .eq("status", "pending")
    .select("invited_email, role, invite_token")
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: "That invitation is no longer pending." }

  const url = inviteUrl(await siteOrigin(), String(data.invite_token))
  const delivery = await sendInviteEmail({
    email: String(data.invited_email),
    url,
    orgName: ctx.org.name,
    inviterName: ctx.userName,
    role: ROLE_LABELS[data.role as Role],
  })
  revalidatePath("/settings")
  return delivery.sent
    ? { message: `Invitation resent to ${data.invited_email}.`, inviteUrl: url }
    : { warning: `Couldn't send the email — ${delivery.reason}`, inviteUrl: url }
}

/** Accepts the invitation behind a link. The database checks the signed-in email matches. */
export async function acceptInviteByToken(token: string, next?: string): Promise<FormState> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("accept_invitation_by_token", { p_token: token })
  if (error) return { error: error.message }
  await rememberOrg((data as { org_id: string }).org_id)
  redirect(safePath(next, "/dashboard"))
}

/** Turns down an invitation: the pending row is the invitee's to delete. */
export async function declineInvite(token: string): Promise<FormState> {
  await requireUser()
  const supabase = await createClient()
  const { error } = await supabase.from("memberships").delete().eq("invite_token", token)
  if (error) return { error: error.message }
  redirect("/onboarding")
}

export async function removeMember(membershipId: string): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isAdmin(ctx.role)) return { error: "Only owners and admins can remove people." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("memberships")
    .delete()
    .eq("id", membershipId)
    .eq("org_id", ctx.org.id)
    .select("id")
  if (error) return { error: error.message }
  if (!data?.length) return { error: "That person couldn't be removed." }
  revalidatePath("/settings")
  return {}
}
