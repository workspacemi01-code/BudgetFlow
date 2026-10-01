"use client"

import { useActionState } from "react"
import { CalendarPlus } from "lucide-react"

import { startBudget } from "@/app/actions/personal"
import type { FormState } from "@/lib/types"

/**
 * The budget on screen has finished.
 *
 * pickBudget falls back to the most recent budget when none covers today, so
 * on the 1st of a month someone opens the app and lands in last month —
 * looking at last month's total, and adding today's spending to it. The month
 * name was on the screen, but one word in a heading is not enough to stop
 * somebody filing November's groceries under October.
 *
 * So the page says it plainly and offers the one thing worth doing. The new
 * period arrives with this one's categories and amounts, so starting it costs
 * nothing and nobody has to rebuild their list.
 */
export function PeriodEnded({
  budgetName,
  cadence,
  nextName,
  currency,
}: {
  budgetName: string
  cadence: "monthly" | "yearly"
  nextName: string
  currency: string
}) {
  const [state, action, pending] = useActionState(startBudget, {} as FormState)

  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
      <div className="flex items-start gap-3">
        <CalendarPlus className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {budgetName} has ended
          </p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300/90">
            You are looking at a finished {cadence === "monthly" ? "month" : "year"}. Anything you
            add now is recorded against it, not against {nextName}.
          </p>

          <form action={action} className="mt-3">
            <input type="hidden" name="cadence" value={cadence} />
            <input type="hidden" name="currency" value={currency} />
            {/* No start date: the function snaps today to the period it falls
                in, so this is always the one the person is actually living in. */}
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-10 items-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white disabled:opacity-60 dark:bg-amber-600"
            >
              {pending ? "Starting…" : `Start ${nextName}`}
            </button>
          </form>

          <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/70">
            Your categories and amounts carry over. Spending starts at zero.
          </p>

          {state.error && (
            <p className="mt-2 text-sm text-red-700 dark:text-red-400">{state.error}</p>
          )}
        </div>
      </div>
    </div>
  )
}
