"use client"

import { useActionState, useState } from "react"
import { Check, Search, Trash2, Undo2 } from "lucide-react"

import { markPaid, removeEntry } from "@/app/actions/personal"
import { FormMessage } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"
import { dayLabel } from "@/lib/personal-math"
import type { PersonalEntry } from "@/lib/personal"
import { cn } from "@/lib/utils"

type Entry = PersonalEntry & { lineName: string }

/**
 * Everything spent this period, newest first and grouped by day.
 *
 * Grouped because that is how people remember money — "what did I spend
 * Tuesday" — and because a flat list of forty rows all looks the same. Each
 * day carries its own total, which is usually the thing being looked for.
 */
export function ActivityScreen({
  budgetId,
  budgetName,
  entries,
  currency,
}: {
  budgetId: string
  budgetName: string
  entries: Entry[]
  currency: string
}) {
  const [query, setQuery] = useState("")
  const money = (v: number) => formatMoney(v, currency)

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? entries.filter(
        (e) =>
          (e.description ?? "").toLowerCase().includes(needle) ||
          e.lineName.toLowerCase().includes(needle)
      )
    : entries

  const days = groupByDay(shown)
  const total = shown.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold">{budgetName}</h1>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search spends"
            aria-label="Search spends"
            className="h-12 pl-9 text-base"
          />
        </div>
        <p className="px-1 text-xs text-muted-foreground tabular-nums">
          {shown.length === 0
            ? "Nothing to show"
            : `${shown.length} ${shown.length === 1 ? "spend" : "spends"} · ${money(total)}`}
        </p>
      </div>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            {entries.length === 0 ? "No spends recorded yet." : "Nothing matches that."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map(([day, rows]) => (
            <section key={day} className="space-y-2">
              <div className="flex items-baseline justify-between px-1">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {dayLabel(day)}
                </h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {money(rows.reduce((s, r) => s + r.amount, 0))}
                </span>
              </div>
              <ul className="divide-y rounded-xl border bg-card">
                {rows.map((entry) => (
                  <li key={entry.id}>
                    <Row entry={entry} budgetId={budgetId} money={money} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function groupByDay(entries: Entry[]): [string, Entry[]][] {
  const map = new Map<string, Entry[]>()
  for (const entry of entries) {
    const list = map.get(entry.spentOn) ?? []
    list.push(entry)
    map.set(entry.spentOn, list)
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}

function Row({
  entry,
  budgetId,
  money,
}: {
  entry: Entry
  budgetId: string
  money: (v: number) => string
}) {
  const [payState, pay] = useActionState(markPaid, {})
  const [removeState, remove] = useActionState(removeEntry, {})
  const paid = Boolean(entry.paidAt)

  return (
    <div className="flex items-center gap-2 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{entry.description || entry.lineName}</div>
        <div className="text-[11px] text-muted-foreground">
          {entry.lineName}
          {!paid && " · not paid yet"}
        </div>
      </div>
      <span className={cn("shrink-0 text-sm tabular-nums", !paid && "text-muted-foreground")}>
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
