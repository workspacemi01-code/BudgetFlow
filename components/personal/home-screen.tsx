"use client"

import Link from "next/link"
import { ArrowRight, ChevronRight, TrendingDown } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { PeriodEnded } from "@/components/personal/period-ended"
import { dailyAllowance, dayLabel, isBudgeted, type BudgetTotals, type PersonalLine } from "@/lib/personal-math"
import type { PersonalBudget, PersonalEntry } from "@/lib/personal"
import { cn } from "@/lib/utils"

/**
 * What you see when you open the app.
 *
 * One number at the top, and it is not "total spent" — it is what is left and
 * how long it has to last. "₦220,000 left" is a fact; "₦18,000 a day for the
 * next 12 days" is something you can act on before you buy the thing.
 *
 * Below it, only what changes: categories heading for trouble, and the last few
 * spends so you can see the one you just typed actually landed.
 */
export function HomeScreen({
  budget,
  lines,
  totals,
  recent,
  currency,
}: {
  budget: PersonalBudget
  lines: PersonalLine[]
  totals: BudgetTotals
  recent: (PersonalEntry & { lineName: string })[]
  currency: string
}) {
  const money = (v: number) => formatMoney(v, currency)

  /* Compared as plain YYYY-MM-DD strings, which is how the dates arrive and
     how they sort — turning them into Date objects only invites a timezone to
     decide whether the month has ended. */
  const today = new Date().toISOString().slice(0, 10)
  const ended = budget.endDate < today

  const nextName = (() => {
    const [y, m] = budget.startDate.split("-").map(Number)
    if (budget.cadence === "yearly") return String(y + 1)
    const d = new Date(Date.UTC(y, m, 1))
    return d.toLocaleDateString("en", { month: "long", year: "numeric", timeZone: "UTC" })
  })()
  const allowance = totals.hasBudget ? dailyAllowance(totals.remaining, budget.endDate) : null
  const over = totals.hasBudget && totals.remaining < 0

  return (
    <div className="space-y-4">
      {ended && (
        <PeriodEnded
          budgetName={budget.name}
          cadence={budget.cadence}
          nextName={nextName}
          currency={currency}
        />
      )}

      <Headline
        budget={budget}
        totals={totals}
        allowance={allowance}
        over={over}
        money={money}
      />

      {totals.overLines.length > 0 && (
        <Link
          href={`/personal/${budget.id}/budget`}
          className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300"
        >
          <TrendingDown className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">
            Over on <span className="font-semibold">{totals.overLines.map((l) => l.name).join(", ")}</span>
          </span>
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}

      <Section
        title="Where it's going"
        action={{ href: `/personal/${budget.id}/budget`, label: "All categories" }}
      >
        {lines.length === 0 ? (
          <Empty
            message="No categories yet."
            href={`/personal/${budget.id}/budget`}
            cta="Set up your budget"
          />
        ) : (
          /* Every category, not the busiest four. Picking the one you are
             about to spend on is the common errand, and sending people to
             another screen for it made the section decorative. Taller than
             about six and it scrolls in place rather than pushing Recent off
             the bottom. */
          <ul
            className={cn(
              "space-y-2",
              lines.length > 6 && "max-h-[22rem] overflow-y-auto overscroll-contain pr-1"
            )}
          >
            {sortedLines(lines).map((line) => (
              <li key={line.id}>
                <MiniLine line={line} budgetId={budget.id} money={money} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Recent"
        action={{ href: `/personal/${budget.id}/activity`, label: "See all" }}
      >
        {recent.length === 0 ? (
          <Empty
            message="Nothing recorded yet."
            href={`/personal/${budget.id}/add`}
            cta="Record your first spend"
          />
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {recent.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{entry.description || entry.lineName}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {entry.lineName} · {dayLabel(entry.spentOn)}
                    {!entry.paidAt && " · not paid"}
                  </div>
                </div>
                <span className="shrink-0 text-sm tabular-nums">{money(entry.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

/** Trouble first, then the busiest — the order you would look in. */
function sortedLines(lines: PersonalLine[]): PersonalLine[] {
  return [...lines].sort((a, b) => {
    const aOver = isBudgeted(a) && a.remaining < 0
    const bOver = isBudgeted(b) && b.remaining < 0
    if (aOver !== bOver) return aOver ? -1 : 1
    return b.committed - a.committed
  })
}

function Headline({
  budget,
  totals,
  allowance,
  over,
  money,
}: {
  budget: PersonalBudget
  totals: BudgetTotals
  allowance: { daysLeft: number; perDay: number } | null
  over: boolean
  money: (v: number) => string
}) {
  if (!totals.hasBudget) {
    return (
      <Card>
        <CardContent className="space-y-1 py-6 text-center">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Spent in {budget.name}
          </div>
          <div className="text-4xl font-bold tabular-nums">{money(totals.committed)}</div>
          <Link
            href={`/personal/${budget.id}/budget`}
            className="inline-block pt-2 text-sm font-medium text-primary underline underline-offset-4"
          >
            Set your amounts to see what&apos;s left
          </Link>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-6">
        <div className="text-center">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {over ? `Over budget in ${budget.name}` : `Left in ${budget.name}`}
          </div>
          <div
            className={cn(
              "mt-1 text-5xl font-bold tracking-tight tabular-nums",
              over ? "text-red-600 dark:text-red-400" : "text-foreground"
            )}
          >
            {money(Math.abs(totals.remaining))}
          </div>
          {allowance && (
            <p className="mt-2 text-sm text-muted-foreground">
              {over ? (
                <>
                  {allowance.daysLeft} {allowance.daysLeft === 1 ? "day" : "days"} still to go
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{money(allowance.perDay)}</span> a day
                  for {allowance.daysLeft} more {allowance.daysLeft === 1 ? "day" : "days"}
                </>
              )}
            </p>
          )}
        </div>

        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full", over ? "bg-red-500" : "bg-primary")}
            style={{
              width: `${over ? 100 : Math.min(100, (totals.committed / totals.planned) * 100)}%`,
            }}
          />
        </div>

        {/* All three, not just what is left. "Spent ₦30,000 of ₦32,000" is the
            sentence people actually check; a remaining figure alone makes them
            work out the other two. */}
        <dl className="grid grid-cols-3 gap-2 border-t pt-3 text-center">
          <div>
            <dt className="text-[11px] text-muted-foreground">Budgeted</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{money(totals.planned)}</dd>
          </div>
          <div className="border-x">
            <dt className="text-[11px] text-muted-foreground">Spent</dt>
            <dd className="mt-0.5 text-sm font-semibold tabular-nums">{money(totals.spent)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">
              {over ? "Over by" : "Left"}
            </dt>
            <dd
              className={cn(
                "mt-0.5 text-sm font-semibold tabular-nums",
                over && "text-red-600 dark:text-red-400"
              )}
            >
              {money(Math.abs(totals.remaining))}
            </dd>
          </div>
        </dl>

        {/* Money owed but not yet paid sits between spent and left, so it is
            named rather than silently folded into one of them. */}
        {totals.upcoming > 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            Includes {money(totals.upcoming)} not yet paid
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function MiniLine({
  line,
  budgetId,
  money,
}: {
  line: PersonalLine
  budgetId: string
  money: (v: number) => string
}) {
  const budgeted = isBudgeted(line)
  const over = budgeted && line.remaining < 0
  const used = budgeted ? Math.min(100, (line.committed / line.planned) * 100) : 0

  return (
    /* Same row as the budget screen, so a category behaves the same wherever
       it is tapped. */
    <Link
      href={`/personal/${budgetId}/category/${line.id}`}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-colors active:bg-muted/50",
        over && "border-red-300 dark:border-red-500/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium">{line.name}</span>
          <span
            className={cn(
              "shrink-0 text-sm tabular-nums",
              over ? "font-semibold text-red-600 dark:text-red-400" : "text-muted-foreground"
            )}
          >
            {budgeted
              ? over
                ? `${money(Math.abs(line.remaining))} over`
                : `${money(line.remaining)} left`
              : `${money(line.committed)} spent`}
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
            : "No budget set — tap to add one"}
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  )
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: { href: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action && (
          <Link href={action.href} className="text-xs font-medium text-primary">
            {action.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ message, href, cta }: { message: string; href: string; cta: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        <Link
          href={href}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
        >
          {cta}
        </Link>
      </CardContent>
    </Card>
  )
}
