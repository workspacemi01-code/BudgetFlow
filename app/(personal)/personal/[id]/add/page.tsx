import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AddSpendScreen } from "@/components/personal/add-spend-screen"
import { getBudgets, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "Record a spend" }

export default async function AddSpendPage(props: PageProps<"/personal/[id]/add">) {
  const { id } = await props.params
  const { line } = await props.searchParams
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  const lines = await getLines(budget.id)

  return (
    <AddSpendScreen
      budgetId={budget.id}
      lines={lines}
      currency={profile.currency}
      presetLineId={typeof line === "string" ? line : undefined}
    />
  )
}
