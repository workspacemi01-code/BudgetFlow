"use client"

import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { Check, Plus, Trash2, Undo2 } from "lucide-react"

import { addEntry, addLine, markPaid, removeEntry, removeLine, updateLine } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatMoney } from "@/lib/format"
import type { PersonalBudget, PersonalEntry, PersonalLine } from "@/lib/personal"
import { cn } from "@/lib/utils"

interface Totals {
  planned: number
  spent: number
  upcoming: number
  committed: number
  remaining: number
  overLines: PersonalLine[]
}

export function BudgetScreen({
  budget,
  budgets,
  lines,
  entries,
  totals,
  currency,
}: {
  budget: PersonalBudget
  budgets: PersonalBudget[]
  lines: PersonalLine[]
  entries: PersonalEntry[]
  totals: Totals
  currency: string
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const money = (v: number) => formatMoney(v, currency)

  return (
    <div className="space-y-4">
      {/* Which month or year you are looking at. A plain select because on a
          phone it opens the native picker, which beats anything custom. */}
      <div className="flex items-center justify-between gap-3">
        <select
          value={budget.id}
          onChange={(e) => router.push(`/personal/${e.target.value}`)}
          aria-label="Choose a budget"
          className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base font-semibold sm:text-sm"
        >
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <Button variant="outline" className="h-10 shrink-0" onClick={() => router.push("/personal/new")}>
          <Plus className="size-4" aria-hidden />
          New
        </Button>
      </div>

      <Summary totals={totals} money={money} />

      {/* The reason to open the app. Named lines, not a count, so it is
          actionable without scrolling to find which one. */}
      {totals.overLines.length > 0 && (
        <p
          role="status"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300"
        >
          You&apos;re over on{" "}
          <span className="font-semibold">{totals.overLines.map((l) => l.name).join(", ")}</span>.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          What the money is for
        </h2>
        {lines.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing here yet. Add what you spend on — rent, food, transport.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => (
              <LineCard
                key={line.id}
                line={line}
                budgetId={budget.id}
                entries={entries.filter((e) => e.lineId === line.id)}
                money={money}
              />
            ))}
          </ul>
        )}
      </section>

      {adding ? (
        <AddLineForm budgetId={budget.id} onDone={() => setAdding(false)} />
      ) : (
        <Button variant="outline" className="h-12 w-full" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden />
          Add something to budget for
        </Button>
      )}
    </div>
  )
}

function Summary({ totals, money }: { totals: Totals; money: (v: number) => string }) {
  const over = totals.remaining < 0
  const used = totals.planned > 0 ? Math.min(100, (totals.committed / totals.planned) * 100) : 0

  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {over ? "Over by" : "Left to spend"}
          </span>
          <span
            className={cn(
              "text-2xl font-bold tabular-nums",
              over ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}
          >
            {money(Math.abs(totals.remaining))}
          </span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-muted" role="presentation">
          <div
            className={cn("h-full rounded-full transition-all", over ? "bg-red-500" : "bg-primary")}
            style={{ width: `${over ? 100 : used}%` }}
          />
        </div>

        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Budgeted" value={money(totals.planned)} />
          <Stat label="Paid" value={money(totals.spent)} />
          <Stat label="To pay" value={money(totals.upcoming)} />
        </dl>
      </CardContent>
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function LineCard({
  line,
  budgetId,
  entries,
  money,
}: {
  line: PersonalLine
  budgetId: string
  entries: PersonalEntry[]
  money: (v: number) => string
}) {
  const [open, setOpen] = useState(false)
  const over = line.remaining < 0
  const used = line.planned > 0 ? Math.min(100, (line.committed / line.planned) * 100) : 0

  return (
    <li>
      <Card className={cn(over && "border-red-300 dark:border-red-500/40")}>
        <CardContent className="py-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="w-full text-left"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-semibold">{line.name}</span>
              <span className={cn("shrink-0 text-sm tabular-nums", over && "font-semibold text-red-600 dark:text-red-400")}>
                {over ? `${money(Math.abs(line.remaining))} over` : `${money(line.remaining)} left`}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-primary")}
                style={{ width: `${over ? 100 : used}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground tabular-nums">
              <span>
                {money(line.committed)} of {money(line.planned)}
              </span>
              <span>{line.entryCount === 1 ? "1 entry" : `${line.entryCount} entries`}</span>
            </div>
          </button>

          {open && (
            <div className="mt-3 space-y-3 border-t pt-3">
              {entries.length > 0 && (
                <ul className="space-y-1.5">
                  {entries.map((entry) => (
                    <EntryRow key={entry.id} entry={entry} budgetId={budgetId} money={money} />
                  ))}
                </ul>
              )}
              <AddEntryForm lineId={line.id} budgetId={budgetId} />
              <LineSettings line={line} budgetId={budgetId} />
            </div>
          )}
        </CardContent>
      </Card>
    </li>
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
    <li className="flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{entry.description || "Spend"}</div>
        <div className="text-[11px] text-muted-foreground">
          {entry.spentOn}
          {paid ? "" : " · not paid yet"}
        </div>
      </div>
      <span className={cn("shrink-0 text-sm tabular-nums", !paid && "text-muted-foreground")}>
        {money(entry.amount)}
      </span>

      {/* The pay button. Pressing it again undoes, so a mistap is recoverable
          without hunting for a delete. */}
      <form action={pay}>
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        {paid && <input type="hidden" name="undo" value="1" />}
        <Button
          type="submit"
          variant={paid ? "ghost" : "outline"}
          className="size-9 shrink-0 p-0"
          aria-label={paid ? `Mark ${entry.description ?? "entry"} as not paid` : `Mark ${entry.description ?? "entry"} as paid`}
        >
          {paid ? <Undo2 className="size-4" aria-hidden /> : <Check className="size-4" aria-hidden />}
        </Button>
      </form>

      <form action={remove}>
        <input type="hidden" name="entryId" value={entry.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        <Button type="submit" variant="ghost" className="size-9 shrink-0 p-0 text-muted-foreground" aria-label="Remove">
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </form>

      <FormMessage error={payState.error ?? removeState.error} />
    </li>
  )
}

function AddEntryForm({ lineId, budgetId }: { lineId: string; budgetId: string }) {
  const [state, action] = useActionState(addEntry, {})

  return (
    <form action={action} className="space-y-2">
      <FormMessage error={state.error} />
      <input type="hidden" name="lineId" value={lineId} />
      <input type="hidden" name="budgetId" value={budgetId} />
      <div className="flex gap-2">
        <Input name="description" placeholder="What was it?" className="h-11 min-w-0 flex-1" />
        <Input
          name="amount"
          // inputMode numeric, not type=number: a phone keypad without the
          // spinner, and it lets someone type "12,000" the way they'd write it.
          inputMode="decimal"
          placeholder="Amount"
          required
          className="h-11 w-28 shrink-0"
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" name="paid" defaultChecked className="size-4" />
          Already paid
        </label>
        <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
      </div>
    </form>
  )
}

function LineSettings({ line, budgetId }: { line: PersonalLine; budgetId: string }) {
  const [updateState, update] = useActionState(updateLine, {})
  const [removeState, remove] = useActionState(removeLine, {})

  return (
    <div className="flex items-end gap-2 border-t pt-3">
      <form action={update} className="flex flex-1 items-end gap-2">
        <input type="hidden" name="lineId" value={line.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor={`planned-${line.id}`} className="text-[11px] text-muted-foreground">
            Budget for {line.name}
          </Label>
          <Input
            id={`planned-${line.id}`}
            name="planned"
            inputMode="decimal"
            defaultValue={line.planned || ""}
            placeholder="0"
            className="h-10"
          />
        </div>
        <SubmitButton variant="outline" pendingLabel="Saving…">
          Save
        </SubmitButton>
      </form>

      <form action={remove}>
        <input type="hidden" name="lineId" value={line.id} />
        <input type="hidden" name="budgetId" value={budgetId} />
        <Button type="submit" variant="ghost" className="size-10 p-0 text-muted-foreground" aria-label={`Remove ${line.name}`}>
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </form>

      <FormMessage error={updateState.error ?? removeState.error} />
    </div>
  )
}

function AddLineForm({ budgetId, onDone }: { budgetId: string; onDone: () => void }) {
  const [state, action] = useActionState(addLine, {})

  return (
    <Card>
      <CardContent className="py-4">
        <form action={action} className="space-y-3">
          <FormMessage error={state.error} />
          <div className="flex gap-2">
            <Input name="name" placeholder="Rent, Food, Transport…" required className="h-11 min-w-0 flex-1" />
            <Input name="planned" inputMode="decimal" placeholder="Amount" className="h-11 w-28 shrink-0" />
          </div>
          <input type="hidden" name="budgetId" value={budgetId} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" className="h-11" onClick={onDone}>
              Cancel
            </Button>
            <SubmitButton pendingLabel="Adding…">Add</SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
