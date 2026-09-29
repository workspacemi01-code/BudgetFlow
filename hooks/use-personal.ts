"use client"

import { useActionState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import type { PersonalBudget, PersonalEntry, PersonalProfile } from "@/lib/personal"
import type { FormState } from "@/lib/types"
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
 * The server actions call revalidatePath, which clears Next's caches — but the
 * screens read through React Query, which it cannot reach. Without this, a
 * category you just added waits out staleTime before appearing.
 */
export function useRefreshPersonal() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ["personal"] })
}

/**
 * useActionState, plus the cache refresh every write needs.
 *
 * revalidatePath on the server does not reach the React Query cache these
 * screens read from, so a write that does not call this leaves the dashboard
 * showing figures from before it. Wrapping the hook rather than remembering at
 * ten call sites means a new form cannot forget.
 */
export function usePersonalAction(
  action: (state: FormState, payload: FormData) => Promise<FormState>,
  initial: FormState = {},
) {
  const [state, dispatch, pending] = useActionState(action, initial)
  const refresh = useRefreshPersonal()
  const handled = useRef(state)

  useEffect(() => {
    if (state === handled.current) return
    handled.current = state
    // Only a success changed anything worth re-reading.
    if (state?.message) refresh()
  }, [state, refresh])

  return [state, dispatch, pending] as const
}
