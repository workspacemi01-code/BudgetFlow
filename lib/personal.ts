// An individual's own budget: no organization, no department, no approvals.
//
// The business side reaches its data through a membership and a role. Here the
// only question is "is this row yours", which RLS answers on every table, so
// these helpers stay thin on purpose — there is no permission logic to put in
// them.

import { cache } from "react"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { budgetTotals, isBudgeted, type PersonalLine } from "@/lib/personal-math"
import { requireUser } from "@/lib/session"

export type Cadence = "monthly" | "yearly"

export interface PersonalProfile {
  userId: string
  displayName: string | null
  currency: string
}

export interface PersonalBudget {
  id: string
  name: string
  cadence: Cadence
  startDate: string
  endDate: string
}

export interface PersonalEntry {
  id: string
  lineId: string
  description: string | null
  amount: number
  spentOn: string
  paidAt: string | null
}

const num = (v: unknown) => Number(v ?? 0)

/**
 * The individual account, or null for someone who only has organizations.
 *
 * A row in personal_profiles is what makes an account individual, so its
 * absence is a real answer rather than a missing record.
 */
export const getPersonalProfile = cache(async (): Promise<PersonalProfile | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from("personal_profiles")
    .select("user_id, display_name, currency")
    .maybeSingle()
  if (!data) return null
  return {
    userId: String(data.user_id),
    displayName: data.display_name ? String(data.display_name) : null,
    currency: String(data.currency),
  }
})

/** Send anyone without an individual account back to pick one. */
export async function requirePersonal(): Promise<{ user: Awaited<ReturnType<typeof requireUser>>; profile: PersonalProfile }> {
  const user = await requireUser()
  const profile = await getPersonalProfile()
  if (!profile) redirect("/onboarding")
  return { user, profile }
}

/**
 * Newest first, so the current month is the one you land on.
 *
 * cache() because the layout and the page inside it both need this, and without
 * it every navigation paid for the same query twice.
 */
export const getBudgets = cache(async (): Promise<PersonalBudget[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("personal_budgets")
    .select("id, name, cadence, start_date, end_date")
    .order("start_date", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((b) => ({
    id: String(b.id),
    name: String(b.name),
    cadence: b.cadence as Cadence,
    startDate: String(b.start_date),
    endDate: String(b.end_date),
  }))
})

/**
 * The budget to show when none was asked for: whichever period today falls in,
 * otherwise the most recent. Same rule the business side uses to pick a period.
 */
export function pickBudget(budgets: PersonalBudget[], id?: string): PersonalBudget | null {
  if (id) return budgets.find((b) => b.id === id) ?? null
  const today = new Date().toISOString().slice(0, 10)
  return budgets.find((b) => b.startDate <= today && today <= b.endDate) ?? budgets[0] ?? null
}

export const getLines = cache(async (budgetId: string): Promise<PersonalLine[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("v_personal_lines")
    .select("id, name, planned, spent, upcoming, committed, remaining, entry_count, position")
    .eq("budget_id", budgetId)
    .order("position")
  if (error) throw new Error(error.message)
  return (data ?? []).map((l) => ({
    id: String(l.id),
    name: String(l.name),
    planned: num(l.planned),
    spent: num(l.spent),
    upcoming: num(l.upcoming),
    committed: num(l.committed),
    remaining: num(l.remaining),
    entryCount: num(l.entry_count),
  }))
})

/**
 * Spends in a budget, newest first.
 *
 * personal_entries has no budget_id — it hangs off a line — which used to mean
 * fetching the lines, then fetching entries for those ids: two round trips to a
 * database that is not in this building. `personal_lines!inner` does the join
 * server-side, so it is one. RLS still scopes both sides to this user.
 *
 * `limit` is for screens that only show the last few; without it Home was
 * loading a whole month of spending to render five rows.
 */
export const getEntries = cache(async (budgetId: string, limit?: number): Promise<PersonalEntry[]> => {
  const supabase = await createClient()
  let query = supabase
    .from("personal_entries")
    .select("id, line_id, description, amount, spent_on, paid_at, personal_lines!inner(budget_id)")
    .eq("personal_lines.budget_id", budgetId)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false })
  if (limit) query = query.limit(limit)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []).map((e) => ({
    id: String(e.id),
    lineId: String(e.line_id),
    description: e.description ? String(e.description) : null,
    amount: num(e.amount),
    spentOn: String(e.spent_on),
    paidAt: e.paid_at ? String(e.paid_at) : null,
  }))
})

// Re-exported so server code keeps one import for the whole model.
export { budgetTotals, isBudgeted, type PersonalLine }
