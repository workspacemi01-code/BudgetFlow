import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BudgetOverview } from "@/components/personal/budget-overview"
import { budgetTotals, getBudgets, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "Budget" }

export default async function BudgetTabPage(props: PageProps<"/personal/[id]/budget">) {
  const { id } = await props.params
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  const lines = await getLines(budget.id)

  return (
    <BudgetOverview
      budget={budget}
      budgets={budgets}
      lines={lines}
      totals={budgetTotals(lines)}
      currency={profile.currency}
    />
  )
}
