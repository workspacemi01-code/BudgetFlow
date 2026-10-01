"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { CURRENCIES } from "@/lib/format"
import { sendInviteEmail } from "@/lib/invites"
import { BRAND_THEMES, ROLE_LABELS, invitableRoles, isAdmin } from "@/lib/roles"
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
  const brandTheme = String(formData.get("brandTheme") ?? "default")
  if (name.length < 2) return { error: "Enter the organization's name." }
  if (!CURRENCIES.some((c) => c.code === currency)) return { error: "Pick a currency." }
  /* Named palettes, not a free colour. A hex field would let someone pick
     something white text cannot sit on, or a red indistinguishable from the
     one reserved for over-budget warnings. Each named palette is tuned once,
     including its warning colour. */
  if (!BRAND_THEMES.some((t) => t.value === brandTheme)) return { error: "Pick a palette." }

  // brand_label is no longer written. The field that set it is gone, so reading
  // it back would send an empty string — and the validation that used to guard
  // it would then have refused every settings save. The column itself is left
  // alone: dropping it would mean a migration against live business data.
  const supabase = await createClient()
  const { error } = await supabase
    .from("organizations")
    .update({
      name,
      currency,
      brand_theme: brandTheme,
      allow_over_budget: formData.get("allowOverBudget") === "on",
    })
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
  const brandIds = formData.getAll("brandIds").map(String).filter(Boolean)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." }
  if (!invitableRoles(ctx.role).includes(role)) return { error: "Pick a role." }
  if (role === "dept_manager" && departmentIds.length === 0) {
    return { error: "Pick at least one department for a department manager." }
  }
  /* A unit-scoped role with no units can see a department and act in none of
     it, which looks like the app is broken rather than like a setting. */
  if ((role === "line_manager" || role === "officer") && brandIds.length === 0) {
    return { error: `Pick at least one ${ctx.org.brand_label.toLowerCase()} for a ${ROLE_LABELS[role].toLowerCase()}.` }
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

  /* Unit-scoped roles reach their department through their units, so the units
     are the only assignment they need. */
  if ((role === "line_manager" || role === "officer") && brandIds.length > 0) {
    const { error: unitError } = await supabase
      .from("membership_brands")
      .insert(brandIds.map((brand_id) => ({ membership_id: data.id, brand_id, org_id: ctx.org.id })))
    if (unitError) return { error: unitError.message }
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

/**
 * Which units a person is attached to.
 *
 * This is what makes a unit manager or an officer usable: until a membership
 * has units, both roles can see their department and do nothing in it. Sent as
 * the full set rather than as add/remove, so the form always states the whole
 * answer and a lost checkbox cannot leave a stale row behind.
 */
export async function setMemberUnits(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isAdmin(ctx.role)) return { error: "Only owners and admins can change unit access." }

  const membershipId = String(formData.get("membershipId") ?? "")
  const brandIds = formData.getAll("brandIds").map(String).filter(Boolean)
  if (!membershipId) return { error: "Pick someone first." }

  const supabase = await createClient()

  /* Replace rather than merge: the checkboxes are the whole truth. */
  const { error: clearError } = await supabase
    .from("membership_brands")
    .delete()
    .eq("membership_id", membershipId)
    .eq("org_id", ctx.org.id)
  if (clearError) return { error: clearError.message }

  if (brandIds.length > 0) {
    const { error } = await supabase
      .from("membership_brands")
      .insert(brandIds.map((brand_id) => ({ membership_id: membershipId, brand_id, org_id: ctx.org.id })))
    if (error) return { error: error.message }
  }

  revalidatePath("/settings")
  revalidatePath("/dashboard")
  return {
    message: brandIds.length
      ? `Saved — ${brandIds.length} ${brandIds.length === 1 ? "unit" : "units"}.`
      : "Saved — no units. They can see the department but not act in it.",
  }
}

/**
 * Whether officers may spend against a unit.
 *
 * This is the Sosa rule as a control rather than a deployment: any unit can be
 * closed to officers, and closing one leaves everything else about it alone —
 * officers still see it, and every other role still spends against it.
 */
export async function setUnitOfficerAccess(_: FormState, formData: FormData): Promise<FormState> {
  const ctx = await requireOrg()
  if (!isAdmin(ctx.role)) return { error: "Only owners and admins can change this." }

  const brandId = String(formData.get("brandId") ?? "")
  const allowed = String(formData.get("allowed") ?? "") === "true"
  if (!brandId) return { error: "Pick a unit first." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("brands")
    .update({ officers_can_spend: allowed })
    .eq("id", brandId)
    .eq("org_id", ctx.org.id)
    .select("name")
    .single()
  if (error) return { error: error.message }

  revalidatePath("/settings")
  revalidatePath("/dashboard")
  return {
    message: allowed
      ? `Officers can spend against ${data.name} again.`
      : `Officers can no longer spend against ${data.name}. They can still see it.`,
  }
}
