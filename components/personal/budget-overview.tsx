"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useState } from "react"
import { ChevronRight, Plus } from "lucide-react"

import { addEntry, addLine } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"
import { isBudgeted, type PersonalLine } from "@/lib/personal-math"
import type { PersonalBudget } from "@/lib/personal"
import { cn } from "@/lib/utils"

interface Totals {
  planned: number
  spent: number
  upcoming: number
  committed: number
  remaining: number
  hasBudget: boolean
  overLines: PersonalLine[]
}

/**
 * The one screen you open every day.
 *
 * Built around the two things that actually happen: recording what you just
 * spent, and seeing whether you have room left. Recording is at the top and
 * takes one line — a category, an amount, done — because it happens several
 * times a day, standing up, on a phone.
 *
 * Everything else about a category (its history, changing its amount, deleting
 * it) lives on that category's own screen. An earlier version put all of it in
 * an accordion under each row, which meant tapping "Savings" dropped a form, a
 * list and a delete button into the middle of the page — too much at once, and
 * impossible to tell what you were looking at.
 */
export function BudgetOverview({
  budget,
  budgets,
  lines,
  totals,
  currency,
}: {
  budget: PersonalBudget
  budgets: PersonalBudget[]
  lines: PersonalLine[]
  totals: Totals
  currency: string
}) {
  const router = useRouter()
  const [addingCategory, setAddingCategory] = useState(false)
  const money = (v: number) => formatMoney(v, currency)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          value={budget.id}
          onChange={(e) => router.push(`/personal/${e.target.value}`)}
          aria-label="Choose a budget"
          className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base font-semibold"
        >
          {budgets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <Link
          href="/personal/new"
          aria-label="Start a new budget"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-background"
        >
          <Plus className="size-5" aria-hidden />
        </Link>
      </div>

      <Summary totals={totals} money={money} />

      {totals.overLines.length > 0 && (
        <p
          role="status"
          className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300"
        >
          You&apos;re over on{" "}
          <span className="font-semibold">{totals.overLines.map((l) => l.name).join(", ")}</span>.
        </p>
      )}

      {/* The thing you came to do. Above the list, not hidden behind a tap. */}
      {lines.length > 0 && <QuickSpend budgetId={budget.id} lines={lines} />}

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Your budget
        </h2>

        {lines.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Add what you spend on — rent, food, transport — and give each one an amount.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {lines.map((line) => (
              <li key={line.id}>
                <LineRow line={line} budgetId={budget.id} money={money} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {addingCategory ? (
        <AddCategoryForm budgetId={budget.id} onDone={() => setAddingCategory(false)} />
      ) : (
        <Button variant="outline" className="h-12 w-full" onClick={() => setAddingCategory(true)}>
          <Plus className="size-4" aria-hidden />
          Add a category
        </Button>
      )}
    </div>
  )
}

function Summary({ totals, money }: { totals: Totals; money: (v: number) => string }) {
  const over = totals.hasBudget && totals.remaining < 0
  const used = totals.planned > 0 ? Math.min(100, (totals.committed / totals.planned) * 100) : 0

  // Nothing budgeted yet: show what has gone out, and what to do next. Calling
  // this "over budget" would be shouting about a limit nobody has set.
  if (!totals.hasBudget) {
    return (
      <Card>
        <CardContent className="space-y-1 py-5 text-center">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Spent so far
          </div>
          <div className="text-4xl font-bold tabular-nums">{money(totals.committed)}</div>
          <p className="pt-1 text-xs text-muted-foreground">
            Set an amount on a category below to start tracking what&apos;s left.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {over ? "Over budget by" : "Left to spend"}
          </div>
          <div
            className={cn(
              "mt-1 text-4xl font-bold tabular-nums",
              over ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}
          >
            {money(Math.abs(totals.remaining))}
          </div>
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", over ? "bg-red-500" : "bg-primary")}
            style={{ width: `${over ? 100 : used}%` }}
          />
        </div>

        <dl className="flex justify-between text-xs">
          <div>
            <dt className="text-muted-foreground">Budgeted</dt>
            <dd className="font-semibold tabular-nums">{money(totals.planned)}</dd>
          </div>
          <div className="text-right">
            <dt className="text-muted-foreground">Spent so far</dt>
            <dd className="font-semibold tabular-nums">{money(totals.committed)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  )
}

/**
 * "I just spent ₦1,000 on food."
 *
 * Three fields on one screen, no navigation, and it stays open after saving so
 * a second entry is immediate. Defaults to already-paid, because by the time
 * you are typing it in, the money has usually gone.
 */
function QuickSpend({ budgetId, lines }: { budgetId: string; lines: PersonalLine[] }) {
  const [state, action] = useActionState(addEntry, {})

  return (
    <Card>
      <CardContent className="py-4">
        <form action={action} className="space-y-2.5">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Record a spend
          </div>
          <FormMessage error={state.error} />
          <input type="hidden" name="budgetId" value={budgetId} />
          <input type="hidden" name="paid" value="1" />

          <div className="flex gap-2">
            <select
              name="lineId"
              required
              aria-label="What was it for?"
              className="h-12 min-w-0 flex-1 rounded-lg border bg-background px-3 text-base"
            >
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <Input
              name="amount"
              inputMode="decimal"
              placeholder="0"
              required
              aria-label="How much"
              className="h-12 w-28 shrink-0 text-base"
            />
          </div>

          <div className="flex gap-2">
            <Input
              name="description"
              placeholder="Note (optional)"
              aria-label="Note"
              className="h-12 min-w-0 flex-1 text-base"
            />
            <SubmitButton className="h-12 w-28 shrink-0" pendingLabel="Saving…">
              Add
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

/** A category, as a tappable row. Tapping opens its own screen — nothing unfolds here. */
function LineRow({
  line,
  budgetId,
  money,
}: {
  line: PersonalLine
  budgetId: string
  money: (v: number) => string
}) {
  // No amount set is not an amount of zero — see isBudgeted in lib/personal.
  const budgeted = isBudgeted(line)
  const over = budgeted && line.remaining < 0
  const used = budgeted ? Math.min(100, (line.committed / line.planned) * 100) : 0

  return (
    <Link
      href={`/personal/${budgetId}/category/${line.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors active:bg-muted/50",
        over && "border-red-300 dark:border-red-500/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate font-semibold">{line.name}</span>
          <span
            className={cn(
              "shrink-0 text-sm tabular-nums",
              over ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}
          >
            {!budgeted
              ? `${money(line.committed)} spent`
              : over
                ? `${money(Math.abs(line.remaining))} over`
                : `${money(line.remaining)} left`}
          </span>
        </div>
        {budgeted && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-primary")}
              style={{ width: `${over ? 100 : used}%` }}
            />
          </div>
        )}
        <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
          {budgeted
            ? `${money(line.committed)} of ${money(line.planned)}`
            : "Tap to set an amount"}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function AddCategoryForm({ budgetId, onDone }: { budgetId: string; onDone: () => void }) {
  const [state, action] = useActionState(addLine, {})

  return (
    <Card>
      <CardContent className="py-4">
        <form action={action} className="space-y-3">
          <FormMessage error={state.error} />
          <input type="hidden" name="budgetId" value={budgetId} />
          <div className="flex gap-2">
            <Input
              name="name"
              placeholder="Rent, Food, Transport…"
              required
              aria-label="Category name"
              className="h-12 min-w-0 flex-1 text-base"
            />
            <Input
              name="planned"
              inputMode="decimal"
              placeholder="Amount"
              aria-label="Amount to budget"
              className="h-12 w-28 shrink-0 text-base"
            />
          </div>
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
