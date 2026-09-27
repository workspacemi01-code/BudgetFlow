import { NextResponse } from "next/server"

import {
  budgetTotals,
  getBudgets,
  getEntries,
  getLines,
  getPersonalProfile,
  pickBudget,
} from "@/lib/personal"

/**
 * Everything one person's budget screen needs, in a single request.
 *
 * Why this exists: each tab used to be a server render of its own, so tapping
 * Budget → Activity → More paid a fresh round trip to Supabase every time —
 * around 450ms each in production, for a few kilobytes of numbers. The data was
 * never the cost. The distance was.
 *
 * Now the browser fetches this once and React Query keeps it, so switching tabs
 * touches no network at all and the numbers are already on screen.
 */
export async function GET(request: Request) {
  const profile = await getPersonalProfile()
  if (!profile) {
    return NextResponse.json({ error: "No individual account" }, { status: 404 })
  }

  const budgets = await getBudgets()
  const requested = new URL(request.url).searchParams.get("budget") ?? undefined
  const budget = pickBudget(budgets, requested)

  if (!budget) {
    return NextResponse.json({ profile, budgets, budget: null, lines: [], entries: [] })
  }

  // The two queries left are independent, so they go together rather than one
  // after the other — one wait instead of two.
  const [lines, entries] = await Promise.all([
    getLines(budget.id),
    getEntries(budget.id),
  ])

  return NextResponse.json(
    { profile, budgets, budget, lines, entries, totals: budgetTotals(lines) },
    {
      headers: {
        // Private: this is one person's money. no-store because the client
        // cache is what makes navigation instant — an HTTP cache on top would
        // only serve stale numbers after a spend was recorded.
        "Cache-Control": "private, no-store",
      },
    },
  )
}
