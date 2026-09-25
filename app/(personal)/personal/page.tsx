import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getBudgets, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "My budget" }

/**
 * Land on the budget you are actually in.
 *
 * Nothing renders here — a person opening the app wants this month, not a list
 * of months, and the list is a click away inside the budget itself.
 */
export default async function PersonalIndexPage() {
  await requirePersonal()
  const budgets = await getBudgets()
  const current = pickBudget(budgets)

  // No budget at all: the account exists but every period was deleted.
  if (!current) redirect("/personal/new")
  redirect(`/personal/${current.id}`)
}
