"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { ArrowLeft, Check, Trash2, Undo2 } from "lucide-react"

import { addEntry, markPaid, removeEntry, removeLine, updateLine } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"
import { isBudgeted, type PersonalLine } from "@/lib/personal-math"
import type { PersonalEntry } from "@/lib/personal"
import { cn } from "@/lib/utils"

/**
 * One category, on its own screen: what it holds, what has gone, and every
 * spend against it.
 *
 * Having its own page rather than an accordion row is what makes the editing
 * bits safe to show at all — changing the amount and deleting the category can
 * sit at the bottom without ever being in the way of the daily job, which is
 * adding a spend.
 */
export function CategoryDetail({
  line,
  entries,
  budgetId,
  budgetName,
  currency,
}: {
  line: PersonalLine
  entries: PersonalEntry[]
  budgetId: string
  budgetName: string
  currency: string
}) {
  const money = (v: number) => formatMoney(v, currency)
  // No amount set is not an amount of zero — see isBudgeted in lib/personal.
  const budgeted = isBudgeted(line)
  const over = budgeted && line.remaining < 0
  const used = budgeted ? Math.min(100, (line.committed / line.planned) * 100) : 0

  return (
    <div className="space-y-4">
      <Link
        href={`/personal/${budgetId}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {budgetName}
      </Link>

      <Card>
        <CardContent className="space-y-3 py-5">
          <div className="text-center">
            <h1 className="text-lg font-semibold">{line.name}</h1>
            <div
              className={cn(
                "mt-1 text-4xl font-bold tabular-nums",
                over ? "text-red-600 dark:text-red-400" : "text-foreground"
              )}
            >
              {money(budgeted ? Math.abs(line.remaining) : line.committed)}
            </div>
            <div className="text-xs text-muted-foreground">
              {!budgeted
                ? "spent · no budget set for this yet"
                : over
                  ? `over budget · ${money(line.committed)} of ${money(line.planned)} used`
                  : `left · ${money(line.committed)} of ${money(line.planned)} used`}
            </div>
          </div>
          {budgeted && (
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-primary")}
                style={{ width: `${over ? 100 : used}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <AddSpend lineId={line.id} budgetId={budgetId} />

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {entries.length === 0
            ? "Nothing spent yet"
            : entries.length === 1
              ? "1 spend"
              : `${entries.length} spends`}
        </h2>
        {entries.length > 0 && (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <EntryRow entry={entry} budgetId={budgetId} money={money} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <CategorySettings line={line} budgetId={budgetId} />
    </div>
  )
}

function AddSpend({ lineId, budgetId }: { lineId: string; budgetId: string }) {
  const [state, action] = useActionState(addEntry, {})

  return (
    <Card>
      <CardContent className="py-4">
        <form action={action} className="space-y-2.5">
          <FormMessage error={state.error} />
          <input type="hidden" name="lineId" value={lineId} />
          <input type="hidden" name="budgetId" value={budgetId} />
          <div className="flex gap-2">
            <Input
              name="description"
              placeholder="What was it?"
              aria-label="What was it?"
              className="h-12 min-w-0 flex-1 text-base"
            />
            <Input
              name="amount"
              inputMode="decimal"
              placeholder="0"
              required
              aria-label="How much"
              className="h-12 w-28 shrink-0 text-base"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" name="paid" defaultChecked className="size-4" />
              Already paid
            </label>
            <SubmitButton className="h-11" pendingLabel="Adding…">
              Add spend
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function EntryRow({
  entry,
  budgetId,
  money,
}: {
  entry: PersonalEntry
  budgetId: string
  money: (v: number) => string
}) {
  const [payState, pay] = useActionState(markPaid, {})
  const [removeState, remove] = useActionState(removeEntry, {})
  const paid = Boolean(entry.paidAt)

  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.description || "Spend"}</div>
        <div className="text-[11px] text-muted-foreground">
          {entry.spentOn}
          {!paid && " · not paid yet"}
        </div>
      </div>
      <span className={cn("shrink-0 tabular-nums", paid ? "font-medium" : "text-muted-foreground")}>
        {money(entry.amount)}
      </span>

      <form action={pay}>
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        {paid && <input type="hidden" name="undo" value="1" />}
        <Button
          type="submit"
          variant={paid ? "ghost" : "outline"}
          className="size-10 shrink-0 p-0"
          aria-label={paid ? "Mark as not paid" : "Mark as paid"}
        >
          {paid ? <Undo2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
        </Button>
      </form>

      <form action={remove}>
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        <Button
          type="submit"
          variant="ghost"
          className="size-10 shrink-0 p-0 text-muted-foreground"
          aria-label="Delete this spend"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </form>

      <FormMessage error={payState.error ?? removeState.error} />
    </div>
  )
}

/**
 * Changing the amount, and deleting.
 *
 * At the bottom, behind a tap for the destructive half — a delete button beside
 * the field you use to correct a number is how a month's records get thrown
 * away by accident.
 */
function CategorySettings({ line, budgetId }: { line: PersonalLine; budgetId: string }) {
  const [updateState, update] = useActionState(updateLine, {})
  const [removeState, remove] = useActionState(removeLine, {})
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="space-y-3 border-t pt-4">
      <form action={update} className="flex items-end gap-2">
        <input type="hidden" name="lineId" value={line.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`planned-${line.id}`} className="text-xs font-semibold">
            Budget for {line.name}
          </label>
          <Input
            id={`planned-${line.id}`}
            name="planned"
            inputMode="decimal"
            defaultValue={line.planned || ""}
            placeholder="0"
            className="h-12 text-base"
          />
        </div>
        <SubmitButton variant="outline" className="h-12" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>
      <FormMessage error={updateState.error} message={updateState.message} />

      {confirming ? (
        <form action={remove} className="flex items-center gap-2 rounded-lg bg-red-50 p-3 dark:bg-red-500/10">
          <input type="hidden" name="lineId" value={line.id} />
          <input type="hidden" name="budgetId" value={budgetId} />
          <p className="min-w-0 flex-1 text-xs text-red-800 dark:text-red-300">
            Delete {line.name} and its {line.entryCount === 1 ? "1 spend" : `${line.entryCount} spends`}?
          </p>
          <Button type="button" variant="ghost" className="h-9" onClick={() => setConfirming(false)}>
            No
          </Button>
          <SubmitButton variant="destructive" pendingLabel="Deleting…">
            Delete
          </SubmitButton>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs font-medium text-muted-foreground underline underline-offset-4"
        >
          Delete this category
        </button>
      )}
      <FormMessage error={removeState.error} />
    </div>
  )
}
