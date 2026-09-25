"use client"

import { useActionState, useState } from "react"

import { startBudget } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

/**
 * Two years back and two forward.
 *
 * Back, because people set up a budgeting app in the middle of a month and want
 * to put last month in properly. Forward, because planning next year in
 * December is the whole point of a yearly budget.
 */
function yearRange(now = new Date()): number[] {
  const y = now.getFullYear()
  return [y - 2, y - 1, y, y + 1, y + 2]
}

export function NewBudgetForm({ currency }: { currency: string }) {
  const [state, action] = useActionState(startBudget, {})
  const now = new Date()
  const [cadence, setCadence] = useState<"monthly" | "yearly">("monthly")
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())

  // Any date inside the period — the database snaps it to the 1st, so the day
  // never matters. Yearly ignores the month for the same reason.
  const start = `${year}-${String((cadence === "monthly" ? month : 0) + 1).padStart(2, "0")}-01`

  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state.error} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="cadence" value={cadence} />
      <input type="hidden" name="start" value={start} />

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold">Which kind?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["monthly", "yearly"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setCadence(value)}
              aria-pressed={cadence === value}
              className={cn(
                "h-12 rounded-lg border text-sm font-medium capitalize transition-colors",
                cadence === value ? "border-primary bg-primary/5 text-primary" : "bg-background"
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <div className={cn("grid gap-2", cadence === "monthly" ? "grid-cols-2" : "grid-cols-1")}>
        {cadence === "monthly" && (
          <div className="space-y-1.5">
            <Label htmlFor="month" className="text-xs font-semibold">
              Month
            </Label>
            <select
              id="month"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="h-12 w-full rounded-lg border bg-background px-3 text-base"
            >
              {MONTHS.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="year" className="text-xs font-semibold">
            Year
          </Label>
          <select
            id="year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="h-12 w-full rounded-lg border bg-background px-3 text-base"
          >
            {yearRange().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {cadence === "monthly"
          ? `Covers all of ${MONTHS[month]} ${year}.`
          : `Covers the whole of ${year}, January to December.`}
      </p>

      <SubmitButton className="h-12 w-full" pendingLabel="Creating…">
        Create budget
      </SubmitButton>
    </form>
  )
}
