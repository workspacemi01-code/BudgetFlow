"use client"

import { use } from "react"

import { AddSpendScreen } from "@/components/personal/add-spend-screen"
import { PersonalScreen } from "@/components/personal/screen"

export default function AddSpendPage(props: PageProps<"/personal/[id]/add">) {
  const { id } = use(props.params)
  const { line } = use(props.searchParams)

  return (
    <PersonalScreen budgetId={id}>
      {({ budget, lines, profile }) =>
        budget ? (
          <AddSpendScreen
            budgetId={budget.id}
            lines={lines}
            currency={profile.currency}
            presetLineId={typeof line === "string" ? line : undefined}
          />
        ) : null
      }
    </PersonalScreen>
  )
}
