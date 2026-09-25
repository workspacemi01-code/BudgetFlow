import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BudgetOverview } from "@/components/personal/budget-overview"
import { budgetTotals, getBudgets, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "My budget" }

export default async function PersonalBudgetPage(props: PageProps<"/personal/[id]">) {
  const { id } = await props.params
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  // Only the lines here — the individual spends belong to the category screens,
  // and loading every entry to render a list of totals was work for nothing.
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
