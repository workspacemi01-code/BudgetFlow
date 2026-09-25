import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { BudgetScreen } from "@/components/personal/budget-screen"
import {
  budgetTotals,
  getBudgets,
  getEntries,
  getLines,
  pickBudget,
  requirePersonal,
} from "@/lib/personal"

export const metadata: Metadata = { title: "My budget" }

export default async function PersonalBudgetPage(props: PageProps<"/personal/[id]">) {
  const { id } = await props.params
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  const [lines, entries] = await Promise.all([getLines(budget.id), getEntries(budget.id)])

  return (
    <BudgetScreen
      budget={budget}
      budgets={budgets}
      lines={lines}
      entries={entries}
      totals={budgetTotals(lines)}
      currency={profile.currency}
    />
  )
}
