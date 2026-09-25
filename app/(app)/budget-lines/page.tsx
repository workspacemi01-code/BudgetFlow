import type { Metadata } from "next"
import { ChevronRight } from "lucide-react"

import { AddLineDialog } from "@/components/budget-dialogs"
import { PageHeader } from "@/components/page-header"
import { SpendLegend, UtilBar } from "@/components/util-bar"
import { formatMoney } from "@/lib/format"
import { getCategories, getDepartmentSummaries, getLineTotals, type LineTotal } from "@/lib/queries"
import { canManageLines, isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Budget lines" }

const ROW_GRID = "md:grid md:grid-cols-[minmax(0,1fr)_repeat(4,7.5rem)_11rem] md:items-center md:gap-4"
const NO_BRAND = "General"

function groupByBrand(rows: LineTotal[]): [string, LineTotal[]][] {
  const groups = new Map<string, LineTotal[]>()
  for (const row of rows) {
    const key = row.brandName ?? NO_BRAND
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.entries()]
}

export default async function BudgetLinesPage() {
  const ctx = await requireOrg()
  const currency = ctx.org.currency
  const money = (value: number, compact = false) => formatMoney(value, currency, { compact })

  // No getBrands: the add-line form no longer asks for one, so fetching them
  // was a query for a field that does not exist any more. Lines that already
  // carry a brand still show it — that comes through v_budget_line_totals.
  const [lines, departments, categories] = await Promise.all([
    getLineTotals(ctx),
    getDepartmentSummaries(ctx),
    getCategories(ctx),
  ])
  const editable = departments.filter((d) => !ctx.departmentIds || ctx.departmentIds.includes(d.id))

  return (
    <>
      <PageHeader
        title="Budget lines"
        description="Each department budget split by category. Spend is always raised against a line."
        actions={
          canManageLines(ctx.role) ? (
            <AddLineDialog
              currency={currency}
              departments={editable.map((d) => ({ id: d.id, name: d.name }))}
              categories={categories.map((c) => c.name)}
              canAddCategory={isApprover(ctx.role)}
            />
          ) : undefined
        }
      />

      {departments.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Add a department first — budget lines are split from a department&apos;s budget.
        </p>
      ) : (
        <>
          <SpendLegend className="mb-3" />
          <div className="space-y-4">
            {departments.map((dept) => {
              const groups = groupByBrand(lines.filter((l) => l.departmentId === dept.id))
              const showGroupHeaders = groups.length > 1 || (groups[0] && groups[0][0] !== NO_BRAND)

              return (
                <details key={dept.id} open className="group overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{dept.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {dept.lineCount} {dept.lineCount === 1 ? "line" : "lines"} · {money(dept.allocated, true)} of{" "}
                        {money(dept.budget, true)} allocated
                      </div>
                    </div>
                    <UtilBar
                      budget={dept.budget}
                      spent={dept.spent}
                      committed={dept.committed}
                      className="hidden w-48 sm:flex"
                    />
                  </summary>

                  <div className="border-t">
                    {groups.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-muted-foreground">No budget lines yet.</p>
                    ) : (
                      <div
                        className={cn("hidden bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground", ROW_GRID)}
                      >
                        <span>Line</span>
                        <span className="text-right">Budget</span>
                        <span className="text-right">Spent</span>
                        <span className="text-right">Committed</span>
                        <span className="text-right">Available</span>
                        <span>Used</span>
                      </div>
                    )}

                    {groups.map(([brand, rows]) => (
                      <div key={brand}>
                        {showGroupHeaders && (
                          <div className="border-t px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase first:border-t-0">
                            {brand}
                          </div>
                        )}
                        {rows.map((row) => (
                          <div key={row.id} className={cn("space-y-2 px-4 py-3 md:space-y-0", ROW_GRID)}>
                            <div className="flex items-center justify-between gap-2 md:block">
                              <span className="font-medium">{row.categoryName}</span>
                              <span
                                className={cn("text-sm font-medium tabular-nums md:hidden", row.available < 0 && "text-red-600")}
                              >
                                {money(row.available, true)} left
                              </span>
                            </div>
                            <span className="hidden text-right tabular-nums md:block">{money(row.budget)}</span>
                            <span className="hidden text-right tabular-nums md:block">{money(row.spent)}</span>
                            <span className="hidden text-right tabular-nums md:block">{money(row.committed)}</span>
                            <span
                              className={cn(
                                "hidden text-right font-medium tabular-nums md:block",
                                row.available < 0 && "text-red-600"
                              )}
                            >
                              {money(row.available)}
                            </span>
                            <UtilBar budget={row.budget} spent={row.spent} committed={row.committed} />
                            <div className="text-xs text-muted-foreground md:hidden">
                              {money(row.spent, true)} spent · {money(row.committed, true)} committed of{" "}
                              {money(row.budget, true)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    {dept.unallocated > 0 && (
                      <div className="border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
                        {money(dept.unallocated)} of this department&apos;s budget is not yet allocated to a line.
                      </div>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
