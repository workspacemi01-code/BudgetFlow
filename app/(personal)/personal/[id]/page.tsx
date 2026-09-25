import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { HomeScreen } from "@/components/personal/home-screen"
import { budgetTotals, getBudgets, getEntries, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "My budget" }

export default async function PersonalHomePage(props: PageProps<"/personal/[id]">) {
  const { id } = await props.params
  const { profile } = await requirePersonal()

  const budgets = await getBudgets()
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  const [lines, entries] = await Promise.all([getLines(budget.id), getEntries(budget.id, 5)])
  const lineName = new Map(lines.map((l) => [l.id, l.name]))

  return (
    <HomeScreen
      budget={budget}
      lines={lines}
      totals={budgetTotals(lines)}
      // Just enough to confirm the last thing you typed actually saved.
      recent={entries.map((e) => ({ ...e, lineName: lineName.get(e.lineId) ?? "" }))}
      currency={profile.currency}
    />
  )
}
