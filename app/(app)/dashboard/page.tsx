import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"

import { DashboardFilters } from "@/components/dashboard-filters"
import { DepartmentList, DepartmentTable } from "@/components/department-table"
import { GetStarted } from "@/components/get-started"
import { MonthlyChart } from "@/components/monthly-chart"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { SpendLegend, UtilBar } from "@/components/util-bar"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDate, formatMoney, formatPercent } from "@/lib/format"
import {
  getBrands,
  getUnits,
  getDepartmentSummaries,
  getDepartments,
  getLineTotals,
  getSpendOverTime,
  getTransactions,
  totalsOf,
  type Grain,
} from "@/lib/queries"
import { canFilterDepartments, canRaiseSpend } from "@/lib/roles"
import { requireOrg } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Dashboard" }

const GRAINS: Grain[] = ["week", "month", "year"]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireOrg()
  const currency = ctx.org.currency
  const money = (value: number, compact = false) => formatMoney(value, currency, { compact })

  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return (Array.isArray(value) ? value[0] : value) || ""
  }
  /* Anything else in the query string is somebody editing the URL, so fall
     back rather than trusting it into a query. */
  const rawGrain = one("grain")
  const grain: Grain = (GRAINS as string[]).includes(rawGrain) ? (rawGrain as Grain) : "month"
  const departmentId = one("department") || null
  const brandId = one("brand") || null
  const unitId = one("unit") || null

  const [departments, lines, months, recent, allDepartments, allBrands, allUnits] = await Promise.all([
    getDepartmentSummaries(ctx),
    getLineTotals(ctx, { departmentId, brandId, unitId }),
    getSpendOverTime(ctx, { grain, departmentId, brandId, unitId }),
    getTransactions(ctx, { limit: 5 }),
    getDepartments(ctx),
    getBrands(ctx),
    getUnits(ctx),
  ])

  /* A departmental account — someone who only reaches one department — is
     told which one, since "Rite Foods Nigeria · FY2026" alone does not say
     whose figures these are. RLS already limits the list, so one entry means
     one department. */
  const soleDepartment = departments.length === 1 ? departments[0].name : null
  const scopedDepartment = departmentId
    ? (allDepartments.find((d) => d.id === departmentId)?.name ?? null)
    : soleDepartment

  const header = (
    <PageHeader
      title="Dashboard"
      description={[ctx.org.name, scopedDepartment, ctx.period?.name].filter(Boolean).join(" · ")}
      actions={
        canRaiseSpend(ctx.role) && lines.length > 0 ? (
          <Link href="/transactions/new" className={cn(buttonVariants(), "h-10 px-4")}>
            <Plus />
            New transaction
          </Link>
        ) : undefined
      }
    />
  )

  if (departments.length === 0) {
    return (
      <>
        {header}
        <GetStarted role={ctx.role} orgName={ctx.org.name} />
      </>
    )
  }

  const totals = totalsOf(departments)
  const pending = lines.reduce((sum, line) => sum + line.pendingAmount, 0)
  const watchlist = lines
    .filter((line) => line.budget > 0 && line.utilisation >= 75)
    .sort((a, b) => b.utilisation - a.utilisation)
    .slice(0, 6)

  const kpis = [
    { label: "Annual budget", value: totals.budget, hint: `${departments.length} departments`, swatch: null },
    { label: "Spent", value: totals.spent, hint: "Paid out to date", swatch: "bg-primary" },
    { label: "Committed", value: totals.committed, hint: "Approved, not yet paid", swatch: "bg-amber-400" },
    { label: "Available", value: totals.available, hint: `${money(pending, true)} awaiting approval`, swatch: null },
  ]

  return (
    <>
      {header}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label} size="sm">
            <CardContent className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {kpi.swatch && <span className={cn("size-2 rounded-full", kpi.swatch)} />}
                {kpi.label}
              </div>
              <div className="text-xl font-semibold tabular-nums sm:text-2xl" title={money(kpi.value)}>
                {money(kpi.value, true)}
              </div>
              <div className="text-xs text-muted-foreground">{kpi.hint}</div>
            </CardContent>
          </Card>
        ))}
        <Card size="sm" className="col-span-2 lg:col-span-1">
          <CardContent className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Utilisation</div>
            <div className="text-xl font-semibold tabular-nums sm:text-2xl">{formatPercent(totals.utilisation)}</div>
            <UtilBar budget={totals.budget} spent={totals.spent} committed={totals.committed} showLabel={false} />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardContent>
          <DashboardFilters
            departments={allDepartments.map((d) => ({ id: d.id, name: d.name }))}
            brands={allBrands.map((b) => ({ id: b.id, name: b.name, parentId: b.departmentId }))}
            units={allUnits.map((u) => ({ id: u.id, name: u.name, parentId: u.brandId }))}
            brandLabel={ctx.org.brand_label || "Brand"}
            showDepartments={canFilterDepartments(ctx.role) && allDepartments.length > 1}
          />
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{grain === "week" ? "Weekly" : grain === "year" ? "Yearly" : "Monthly"} spend</CardTitle>
            <CardDescription>
              Spent and committed, by transaction {grain}
              {scopedDepartment && ` · ${scopedDepartment}`}
            </CardDescription>
            <CardAction>
              <SpendLegend />
            </CardAction>
          </CardHeader>
          <CardContent>
            <MonthlyChart data={months} currency={currency} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Watchlist</CardTitle>
            <CardDescription>Budget lines 75% or more used</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {watchlist.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {lines.length === 0 ? "No budget lines yet." : "Every line is under 75% used."}
              </p>
            )}
            {watchlist.map((line) => (
              <div key={line.id} className="space-y-1.5">
                <div className="text-sm font-medium">{line.label}</div>
                <UtilBar budget={line.budget} spent={line.spent} committed={line.committed} />
                <div className="text-xs text-muted-foreground">
                  {money(line.available)} left
                  {line.pendingAmount > 0 && ` · ${money(line.pendingAmount)} pending approval`}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Departments</CardTitle>
          <CardDescription>Budget against spend for each department</CardDescription>
          <CardAction>
            <Link href="/departments" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block">
            <DepartmentTable rows={departments} currency={currency} />
          </div>
          <div className="md:hidden">
            <DepartmentList rows={departments} currency={currency} />
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardAction>
            <Link href="/transactions" className="text-sm font-medium text-primary hover:underline">
              View all
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spend raised yet.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((txn) => (
                <li key={txn.id} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{txn.description}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {txn.lineLabel} · {formatDate(txn.date)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{money(txn.amount)}</span>
                    <StatusBadge status={txn.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
