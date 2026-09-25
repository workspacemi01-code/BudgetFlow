import { notFound } from "next/navigation"

import { BottomNav } from "@/components/personal/bottom-nav"
import { getBudgets, pickBudget, requirePersonal } from "@/lib/personal"

/**
 * The shell every screen inside a budget sits in: content, then the tab bar.
 *
 * The bar lives here rather than on each page so it never flickers or shifts
 * between tabs — switching tabs swaps only the content beneath it, which is
 * what makes it feel like an app rather than a set of web pages.
 */
export default async function BudgetLayout(props: LayoutProps<"/personal/[id]">) {
  const { id } = await props.params
  // Independent of each other, so they go at the same time rather than one
  // after the other — two round trips become one wait.
  const [, budgets] = await Promise.all([requirePersonal(), getBudgets()])
  const budget = pickBudget(budgets, id)
  if (!budget) notFound()

  return (
    <>
      {/* Room for the bar, plus the home indicator below it, so the last card
          on a long page is never hidden underneath. */}
      <div className="pb-[calc(4rem+env(safe-area-inset-bottom,0px)+1rem)]">{props.children}</div>
      <BottomNav budgetId={budget.id} />
    </>
  )
}
