"use client"

import { use } from "react"

import { ActivityScreen } from "@/components/personal/activity-screen"
import { PersonalScreen } from "@/components/personal/screen"

export default function ActivityPage(props: PageProps<"/personal/[id]/activity">) {
  const { id } = use(props.params)

  return (
    <PersonalScreen budgetId={id}>
      {({ budget, lines, entries, profile }) => {
        if (!budget) return null
        const lineName = new Map(lines.map((l) => [l.id, l.name]))
        return (
          <ActivityScreen
            budgetId={budget.id}
            budgetName={budget.name}
            entries={entries.map((e) => ({ ...e, lineName: lineName.get(e.lineId) ?? "" }))}
            currency={profile.currency}
          />
        )
      }}
    </PersonalScreen>
  )
}
