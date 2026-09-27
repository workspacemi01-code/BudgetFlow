"use client"

import { use } from "react"

import { BudgetOverview } from "@/components/personal/budget-overview"
import { PersonalScreen } from "@/components/personal/screen"
import { budgetTotals } from "@/lib/personal-math"

export default function BudgetTabPage(props: PageProps<"/personal/[id]/budget">) {
  const { id } = use(props.params)

  return (
    <PersonalScreen budgetId={id}>
      {({ budget, budgets, lines, profile }) =>
        budget ? (
          <BudgetOverview
            budget={budget}
            budgets={budgets}
            lines={lines}
            totals={budgetTotals(lines)}
            currency={profile.currency}
          />
        ) : null
      }
    </PersonalScreen>
  )
}
