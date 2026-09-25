"use client"

import { useActionState } from "react"

import { startBudget } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Label } from "@/components/ui/label"

/** Today, and the 1st of next month — enough to cover "this one" and "the next one". */
function periodChoices() {
  const now = new Date()
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const monthName = (d: Date) => d.toLocaleString(undefined, { month: "long", year: "numeric" })
  return [
    { value: iso(thisMonth), label: monthName(thisMonth) },
    { value: iso(nextMonth), label: monthName(nextMonth) },
  ]
}

export function NewBudgetForm({ currency }: { currency: string }) {
  const [state, action] = useActionState(startBudget, {})
  const months = periodChoices()

  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state.error} />
      <input type="hidden" name="currency" value={currency} />

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-xs font-semibold">Which kind?</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer flex-col rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5">
            <span className="flex items-center gap-2">
              <input type="radio" name="cadence" value="monthly" defaultChecked className="size-4" />
              <span className="text-sm font-medium">Monthly</span>
            </span>
          </label>
          <label className="flex cursor-pointer flex-col rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5">
            <span className="flex items-center gap-2">
              <input type="radio" name="cadence" value="yearly" className="size-4" />
              <span className="text-sm font-medium">Yearly</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="start" className="text-xs font-semibold">
          Starting
        </Label>
        {/* Any date inside the period: the database snaps it to the 1st, so
            picking the 14th and the 27th of October give the same budget. */}
        <select
          id="start"
          name="start"
          defaultValue={months[0].value}
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          A yearly budget covers the whole year this date falls in.
        </p>
      </div>

      <SubmitButton className="w-full" pendingLabel="Creating…">
        Create budget
      </SubmitButton>
    </form>
  )
}
