import type { Metadata } from "next"

import { ExportCsvButton } from "@/components/export-csv-button"
import { MonthlyChart } from "@/components/monthly-chart"
import { PageHeader } from "@/components/page-header"
import { SpendLegend, UtilBar } from "@/components/util-bar"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatMoney } from "@/lib/format"
import { getDepartmentSummaries, getLineTotals, getMonthlySummary, totalsByCategory } from "@/lib/queries"
import { requireOrg } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Reports" }

const numeric = "text-right tabular-nums"

export default async function ReportsPage() {
  const ctx = await requireOrg()
  const currency = ctx.org.currency
  const money = (value: number) => formatMoney(value, currency)

  const [months, lines, departments] = await Promise.all([
    getMonthlySummary(ctx),
    getLineTotals(ctx),
    getDepartmentSummaries(ctx),
  ])
  const categories = totalsByCategory(lines)

  return (
    <>
      <PageHeader
        title="Reports"
        description={[ctx.org.name, ctx.period?.name].filter(Boolean).join(" · ")}
        actions={
          departments.length > 0 ? (
            <ExportCsvButton
              filename="department-summary.csv"
              label="Export departments"
              header={["Department", "Code", "Budget", "Allocated", "Spent", "Committed", "Available", "Used %"]}
              rows={departments.map((d) => [
                d.name,
                d.code,
                d.budget,
                d.allocated,
                d.spent,
                d.committed,
                d.available,
                Number(d.utilisation.toFixed(1)),
              ])}
            />
          ) : undefined
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Monthly summary</CardTitle>
          <CardDescription>Approved spend by transaction month</CardDescription>
          {months.length > 0 && (
            <CardAction>
              <ExportCsvButton
                filename="monthly-summary.csv"
                header={["Month", "Transactions", "Approved", "Spent", "Committed"]}
                rows={months.map((m) => [m.key, m.count, m.approved, m.spent, m.committed])}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <SpendLegend />
          <MonthlyChart data={months} currency={currency} />
          {months.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Transactions</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">
                      {m.label} {m.key.slice(0, 4)}
                    </TableCell>
                    <TableCell className={numeric}>{m.count}</TableCell>
                    <TableCell className={numeric}>{money(m.approved)}</TableCell>
                    <TableCell className={numeric}>{money(m.spent)}</TableCell>
                    <TableCell className={numeric}>{money(m.committed)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>By category</CardTitle>
          <CardDescription>All departments combined, most used first</CardDescription>
          {categories.length > 0 && (
            <CardAction>
              <ExportCsvButton
                filename="category-summary.csv"
                header={["Category", "Budget", "Spent", "Committed", "Available", "Used %"]}
                rows={categories.map((c) => [
                  c.name,
                  c.budget,
                  c.spent,
                  c.committed,
                  c.available,
                  Number(c.utilisation.toFixed(1)),
                ])}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">No budget lines yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                  <TableHead className="text-right">Committed</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="w-44">Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className={numeric}>{money(c.budget)}</TableCell>
                    <TableCell className={numeric}>{money(c.spent)}</TableCell>
                    <TableCell className={numeric}>{money(c.committed)}</TableCell>
                    <TableCell className={cn(numeric, "font-medium", c.available < 0 && "text-red-600 dark:text-red-400")}>
                      {money(c.available)}
                    </TableCell>
                    <TableCell>
                      <UtilBar budget={c.budget} spent={c.spent} committed={c.committed} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
