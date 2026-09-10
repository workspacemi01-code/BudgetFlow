"use server"

import { revalidatePath } from "next/cache"

import { canRaiseSpend, isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"
import { createClient } from "@/lib/supabase/server"
import { transactionSchema, type TransactionInput } from "@/lib/validations/transaction"

export interface ActionResult {
  error?: string
  code?: string
}

const STALE = "That transaction changed while you were looking at it. Refresh and try again."

export async function createTransaction(input: TransactionInput): Promise<ActionResult> {
  const ctx = await requireOrg()
  if (!canRaiseSpend(ctx.role)) return { error: "Viewers can't raise spend." }
  const parsed = transactionSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." }
  const values = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      org_id: ctx.org.id,
      budget_line_id: values.budgetLineId,
      txn_date: values.txnDate,
      description: values.description,
      vendor: values.vendor || null,
      approved_amount: values.amount,
      status: "pending",
    })
    .select("txn_code")
    .single()
  if (error) return { error: error.message }
  revalidatePath("/", "layout")
  return { code: data.txn_code as string }
}

async function setStatus(id: string, patch: Record<string, unknown>): Promise<ActionResult> {
  const ctx = await requireOrg()
  if (!isApprover(ctx.role)) return { error: "Only owners, admins and finance can approve or reject spend." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("transactions")
    .update(patch)
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .select("id")
  if (error) return { error: error.message }
  if (!data?.length) return { error: STALE }
  revalidatePath("/", "layout")
  return {}
}

export async function approveTransaction(id: string): Promise<ActionResult> {
  return setStatus(id, { status: "approved" })
}

export async function rejectTransaction(id: string, reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { error: "Give a reason so the requester knows what to change." }
  return setStatus(id, { status: "rejected", rejection_reason: reason.trim() })
}

export async function recordPayment(input: {
  transactionId: string
  amount: number
  paidOn: string
  method: string | null
  reference: string | null
}): Promise<ActionResult> {
  const ctx = await requireOrg()
  if (!isApprover(ctx.role)) return { error: "Only owners, admins and finance can record payments." }
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { error: "Enter the amount paid." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn)) return { error: "Pick the payment date." }

  const supabase = await createClient()
  const { error } = await supabase.from("payments").insert({
    org_id: ctx.org.id,
    transaction_id: input.transactionId,
    amount: input.amount,
    paid_on: input.paidOn,
    method: input.method || null,
    reference: input.reference || null,
  })
  if (error) return { error: error.message }
  revalidatePath("/", "layout")
  return {}
}
