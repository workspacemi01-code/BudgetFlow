"use client"

import { use } from "react"

import { HomeScreen } from "@/components/personal/home-screen"
import { PersonalScreen } from "@/components/personal/screen"
import { budgetTotals } from "@/lib/personal-math"

export default function PersonalHomePage(props: PageProps<"/personal/[id]">) {
  const { id } = use(props.params)

  return (
    <PersonalScreen budgetId={id}>
      {({ budget, lines, entries, profile }) => {
        if (!budget) return null
        const lineName = new Map(lines.map((l) => [l.id, l.name]))
        return (
          <HomeScreen
            budget={budget}
            lines={lines}
            totals={budgetTotals(lines)}
            // Just enough to confirm the last thing you typed actually saved.
            recent={entries.slice(0, 5).map((e) => ({
              ...e,
              lineName: lineName.get(e.lineId) ?? "",
            }))}
            currency={profile.currency}
          />
        )
      }}
    </PersonalScreen>
  )
}
