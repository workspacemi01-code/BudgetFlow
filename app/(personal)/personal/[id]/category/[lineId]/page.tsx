import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CategoryDetail } from "@/components/personal/category-detail"
import { getBudgets, getEntries, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "Category" }

export default async function CategoryPage(props: PageProps<"/personal/[id]/category/[lineId]">) {
  const { id, lineId } = await props.params
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  const [lines, entries] = await Promise.all([getLines(budget.id), getEntries(budget.id)])
  const line = lines.find((l) => l.id === lineId)
  if (!line) notFound()

  return (
    <CategoryDetail
      line={line}
      entries={entries.filter((e) => e.lineId === line.id)}
      budgetId={budget.id}
      budgetName={budget.name}
      currency={profile.currency}
    />
  )
}
