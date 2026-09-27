"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { PersonalBudget, PersonalEntry, PersonalProfile } from "@/lib/personal"
import type { BudgetTotals, PersonalLine } from "@/lib/personal-math"

export interface PersonalData {
  profile: PersonalProfile
  budgets: PersonalBudget[]
  budget: PersonalBudget | null
  lines: PersonalLine[]
  entries: PersonalEntry[]
  totals?: BudgetTotals
}

const key = (budgetId?: string) => ["personal", budgetId ?? "current"] as const

async function fetchPersonal(budgetId?: string): Promise<PersonalData> {
  const url = budgetId ? `/api/personal?budget=${budgetId}` : "/api/personal"
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load your budget (${res.status})`)
  return res.json()
}

/**
 * The budget, served from cache whenever we already have it.
 *
 * `placeholderData` keeps the previous numbers on screen while a different
 * budget loads, so switching months never flashes an empty layout — the
 * figures simply update in place.
 */
export function usePersonal(budgetId?: string) {
  return useQuery({
    queryKey: key(budgetId),
    queryFn: () => fetchPersonal(budgetId),
    placeholderData: (previous) => previous,
  })
}

/**
 * Throw away what we know, after a write.
 *
 * Each server action already revalidates its own path; this is the client
 * cache's half of the same job. Without it, a spend you just recorded would not
 * appear until the cache went stale on its own.
 */
export function useRefreshPersonal() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ["personal"] })
}
