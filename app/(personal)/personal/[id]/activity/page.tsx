import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { ActivityScreen } from "@/components/personal/activity-screen"
import { getBudgets, getEntries, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "Activity" }

export default async function ActivityPage(props: PageProps<"/personal/[id]/activity">) {
  const { id } = await props.params
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  const [lines, entries] = await Promise.all([getLines(budget.id), getEntries(budget.id)])
  const lineName = new Map(lines.map((l) => [l.id, l.name]))

  return (
    <ActivityScreen
      budgetId={budget.id}
      budgetName={budget.name}
      entries={entries.map((e) => ({ ...e, lineName: lineName.get(e.lineId) ?? "" }))}
      currency={profile.currency}
    />
  )
}
