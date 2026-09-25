"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireUser } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import type { FormState } from "@/lib/types"

/**
 * Money as typed by a person: "200,000", " 1500 ", "₦4,000".
 *
 * Returns null when it isn't a number at all, so the caller can say so rather
 * than quietly writing a zero — a budget line silently set to nothing is worse
 * than an error message.
 */
function amountFrom(formData: FormData, field: string, { allowZero = true } = {}): number | null {
  const raw = String(formData.get(field) ?? "").replace(/[₦$€£,\s]/g, "")
  if (raw === "") return allowZero ? 0 : null
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) return null
  if (!allowZero && value === 0) return null
  // Kobo, not fractions of one: the column is numeric(14,2).
  return Math.round(value * 100) / 100
}

/** Start an individual account, or add another period to one that exists. */
export async function startBudget(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const cadence = String(formData.get("cadence") ?? "monthly")
  if (cadence !== "monthly" && cadence !== "yearly") return { error: "Choose monthly or yearly." }

  const currency = String(formData.get("currency") ?? "NGN").toUpperCase()
  if (!/^[A-Z]{3}$/.test(currency)) return { error: "Choose a currency." }

  // A date inside the period you want. The function snaps it to the 1st, so
  // "next month" is just today plus a month rather than date arithmetic here.
  const start = String(formData.get("start") ?? "").trim()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("start_personal_budget", {
    p_cadence: cadence,
    ...(start ? { p_start: start } : {}),
    p_currency: currency,
  })
  if (error) return { error: error.message }

  revalidatePath("/", "layout")
  redirect(`/personal/${String(data)}`)
}

export async function addLine(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const budgetId = String(formData.get("budgetId") ?? "")
  const name = String(formData.get("name") ?? "").trim()
  const planned = amountFrom(formData, "planned")

  if (!budgetId) return { error: "Which budget is this for?" }
  if (!name) return { error: "Give it a name — Rent, Food, Transport." }
  if (name.length > 60) return { error: "Keep the name under 60 characters." }
  if (planned === null) return { error: "Enter the amount as a number." }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("personal_lines")
    .insert({ budget_id: budgetId, user_id: user.id, name, planned })
    .select("id")
    .single()
  // 23505 is the case-insensitive unique index: the same envelope twice.
  if (error) return { error: error.code === "23505" ? `You already have ${name} in this budget.` : error.message }

  // Every screen under the budget shows categories, so refresh the branch
  // rather than one page — otherwise the new one is missing from the tab you
  // switch to next.
  revalidatePath(`/personal/${budgetId}`, "layout")
  // Handed back so the spend form can select what you just made.
  return { message: `${name} added.`, createdId: data ? String(data.id) : undefined }
}

export async function updateLine(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const id = String(formData.get("lineId") ?? "")
  const budgetId = String(formData.get("budgetId") ?? "")
  const planned = amountFrom(formData, "planned")
  if (!id) return { error: "Which line?" }
  if (planned === null) return { error: "Enter the amount as a number." }

  const supabase = await createClient()
  const { error } = await supabase.from("personal_lines").update({ planned }).eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/personal/${budgetId}`)
  return { message: "Saved." }
}

export async function removeLine(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const id = String(formData.get("lineId") ?? "")
  const budgetId = String(formData.get("budgetId") ?? "")
  const supabase = await createClient()
  const { error } = await supabase.from("personal_lines").delete().eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/personal/${budgetId}`)
  return { message: "Removed." }
}

/**
 * Record a spend.
 *
 * `paid` decides which side of the line it lands on: money already gone, or
 * money still owed. Both count against the budget — the difference is only
 * whether it has left the account yet.
 */
export async function addEntry(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser()
  const lineId = String(formData.get("lineId") ?? "")
  const budgetId = String(formData.get("budgetId") ?? "")
  const description = String(formData.get("description") ?? "").trim()
  const amount = amountFrom(formData, "amount", { allowZero: false })
  const paid = formData.get("paid") !== null
  const spentOn = String(formData.get("spentOn") ?? "").trim()

  if (!lineId) return { error: "Choose what this was for." }
  if (amount === null) return { error: "Enter how much it was." }

  const supabase = await createClient()
  const { error } = await supabase.from("personal_entries").insert({
    line_id: lineId,
    user_id: user.id,
    description: description || null,
    amount,
    ...(spentOn ? { spent_on: spentOn } : {}),
    paid_at: paid ? new Date().toISOString() : null,
  })
  if (error) return { error: error.message }

  revalidatePath(`/personal/${budgetId}`)
  return { message: "Added." }
}

/** The pay button: move an expense from "still owed" to "gone". */
export async function markPaid(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const id = String(formData.get("entryId") ?? "")
  const budgetId = String(formData.get("budgetId") ?? "")
  // Pressing it again on something already paid should undo, not double-count.
  const undo = formData.get("undo") !== null

  const supabase = await createClient()
  const { error } = await supabase
    .from("personal_entries")
    .update({ paid_at: undo ? null : new Date().toISOString() })
    .eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/personal/${budgetId}`)
  return { message: undo ? "Marked as not paid." : "Marked as paid." }
}

export async function removeEntry(_: FormState, formData: FormData): Promise<FormState> {
  await requireUser()
  const id = String(formData.get("entryId") ?? "")
  const budgetId = String(formData.get("budgetId") ?? "")
  const supabase = await createClient()
  const { error } = await supabase.from("personal_entries").delete().eq("id", id)
  if (error) return { error: error.message }

  revalidatePath(`/personal/${budgetId}`)
  return { message: "Removed." }
}
