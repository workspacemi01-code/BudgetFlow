import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarPlus, ChevronRight } from "lucide-react"

import { SignOutMenuItem } from "@/components/personal/sign-out-item"
import { Card, CardContent } from "@/components/ui/card"
import { formatMoney } from "@/lib/format"
import { budgetTotals, getBudgets, getLines, pickBudget, requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "More" }

export default async function MorePage(props: PageProps<"/personal/[id]/more">) {
  const { id } = await props.params
  const { user, profile } = await requirePersonal()

  const budgets = await getBudgets()
  const current = pickBudget(budgets, id)
  if (!current) notFound()

  const lines = await getLines(current.id)
  const totals = budgetTotals(lines)

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Your budgets
        </h2>
        <ul className="divide-y rounded-xl border bg-card">
          {budgets.map((b) => (
            <li key={b.id}>
              <Link
                href={`/personal/${b.id}`}
                className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {b.name}
                    {b.id === current.id && (
                      <span className="ml-2 text-[11px] font-normal text-primary">Open now</span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground capitalize">{b.cadence}</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
          <li>
            <Link href="/personal/new" className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50">
              <CalendarPlus className="size-4 text-primary" aria-hidden />
              <span className="flex-1 text-sm font-medium text-primary">Start another budget</span>
            </Link>
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {current.name} so far
        </h2>
        <Card>
          <CardContent className="grid grid-cols-2 gap-4 py-4 text-sm">
            <Stat label="Budgeted" value={formatMoney(totals.planned, profile.currency)} />
            <Stat label="Spent" value={formatMoney(totals.committed, profile.currency)} />
            <Stat label="Paid" value={formatMoney(totals.spent, profile.currency)} />
            <Stat label="Still to pay" value={formatMoney(totals.upcoming, profile.currency)} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Account
        </h2>
        <Card>
          <CardContent className="space-y-3 py-4">
            <div>
              <div className="text-sm font-medium">{profile.displayName ?? user.name}</div>
              <div className="text-xs text-muted-foreground">{user.email}</div>
              <div className="mt-1 text-xs text-muted-foreground">Currency: {profile.currency}</div>
            </div>
            <SignOutMenuItem />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="truncate font-semibold tabular-nums">{value}</div>
    </div>
  )
}
