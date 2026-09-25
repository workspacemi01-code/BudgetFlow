// The arithmetic of a personal budget, and nothing else.
//
// Separate from lib/personal.ts on purpose: that module reaches for the
// server-side Supabase client, which reads cookies, so importing any *value*
// from it into a Client Component drags `next/headers` into the browser bundle
// and the whole app 500s. Types are erased at build time and so are safe to
// import from there; functions are not.
//
// Everything here is pure, so both sides can share one definition of what
// "over budget" means instead of each having their own.

export interface PersonalLine {
  id: string
  name: string
  /** What was set aside. */
  planned: number
  /** Already paid. */
  spent: number
  /** Recorded but not paid yet. */
  upcoming: number
  /** spent + upcoming — everything this line is on the hook for. */
  committed: number
  /** planned − committed. Negative means over. */
  remaining: number
  entryCount: number
}

/**
 * A category with no amount set yet is not a category with an amount of zero.
 *
 * Without this, a brand-new budget shouts "over budget" the moment the first
 * spend is recorded — nothing has been budgeted, so everything is instantly
 * "over". That is alarming and wrong: you cannot exceed a limit you have not
 * set. Until an amount exists, a category is simply being tracked.
 */
export const isBudgeted = (line: PersonalLine) => line.planned > 0

export interface BudgetTotals {
  planned: number
  spent: number
  upcoming: number
  committed: number
  remaining: number
  /** True once any amount has been set — before that there is nothing to be over. */
  hasBudget: boolean
  overLines: PersonalLine[]
}

/**
 * How much is left per day, and how many days are left.
 *
 * The single most useful number a budgeting app can show, and the one people
 * actually act on: "₦220,000 left" means nothing until you know it has to
 * cover twelve more days. Returns null before an amount is set, and once the
 * period is over — a daily allowance for a month that has ended is noise.
 */
export function dailyAllowance(
  remaining: number,
  endDate: string,
  today = new Date()
): { daysLeft: number; perDay: number } | null {
  const end = new Date(`${endDate}T23:59:59`)
  const ms = end.getTime() - today.getTime()
  if (ms <= 0) return null
  // Today counts: on the last day of the month you still have today to spend it.
  const daysLeft = Math.max(1, Math.ceil(ms / 86_400_000))
  return { daysLeft, perDay: Math.max(0, remaining) / daysLeft }
}

/** What the whole budget adds up to. */
export function budgetTotals(lines: PersonalLine[]): BudgetTotals {
  const planned = lines.reduce((sum, l) => sum + l.planned, 0)
  const spent = lines.reduce((sum, l) => sum + l.spent, 0)
  const upcoming = lines.reduce((sum, l) => sum + l.upcoming, 0)
  const committed = spent + upcoming
  return {
    planned,
    spent,
    upcoming,
    committed,
    remaining: planned - committed,
    hasBudget: planned > 0,
    // Counted per line, not on the total: being ₦12,000 over on food is worth
    // saying even when the budget as a whole still has room.
    overLines: lines.filter((l) => isBudgeted(l) && l.remaining < 0),
  }
}

/**
 * "Today", "Yesterday", then a short date.
 *
 * A raw 2026-09-25 next to a spend makes you do arithmetic to answer "was that
 * the one I just typed" — which is exactly what you are checking for.
 */
export function dayLabel(iso: string, today = new Date()): string {
  const asDay = (d: Date) => d.toISOString().slice(0, 10)
  if (iso === asDay(today)) return "Today"
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  if (iso === asDay(yesterday)) return "Yesterday"
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })
}
