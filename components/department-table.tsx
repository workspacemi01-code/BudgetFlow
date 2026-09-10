import { Stat } from "@/components/stat"
import { UtilBar } from "@/components/util-bar"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { DepartmentSummary } from "@/lib/queries"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

function availableClass(value: number) {
  return value < 0 ? "text-red-600 dark:text-red-400" : undefined
}

/** Desktop / tablet table. */
export function DepartmentTable({
  rows,
  currency,
  detailed = false,
}: {
  rows: DepartmentSummary[]
  currency: string
  detailed?: boolean
}) {
  const money = (value: number) => formatMoney(value, currency)
  const total = rows.reduce(
    (acc, r) => ({
      budget: acc.budget + r.budget,
      allocated: acc.allocated + r.allocated,
      spent: acc.spent + r.spent,
      committed: acc.committed + r.committed,
    }),
    { budget: 0, allocated: 0, spent: 0, committed: 0 }
  )
  const totalAvailable = total.budget - total.spent - total.committed

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Department</TableHead>
          <TableHead className="text-right">Budget</TableHead>
          {detailed && <TableHead className="text-right">Allocated</TableHead>}
          <TableHead className="text-right">Spent</TableHead>
          <TableHead className="text-right">Committed</TableHead>
          <TableHead className="text-right">Available</TableHead>
          <TableHead className="w-44">Used</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell>
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.code}</div>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.budget > 0 ? money(r.budget) : <span className="text-muted-foreground">Not set</span>}
            </TableCell>
            {detailed && (
              <TableCell className="text-right tabular-nums">
                <div>{money(r.allocated)}</div>
                <div className="text-xs text-muted-foreground">
                  {r.unallocated > 0 ? `${money(r.unallocated)} unallocated` : r.budget > 0 ? "Fully allocated" : ""}
                </div>
              </TableCell>
            )}
            <TableCell className="text-right tabular-nums">{money(r.spent)}</TableCell>
            <TableCell className="text-right tabular-nums">{money(r.committed)}</TableCell>
            <TableCell className={cn("text-right font-medium tabular-nums", availableClass(r.available))}>
              {money(r.available)}
            </TableCell>
            <TableCell>
              <UtilBar budget={r.budget} spent={r.spent} committed={r.committed} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right tabular-nums">{money(total.budget)}</TableCell>
          {detailed && <TableCell className="text-right tabular-nums">{money(total.allocated)}</TableCell>}
          <TableCell className="text-right tabular-nums">{money(total.spent)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(total.committed)}</TableCell>
          <TableCell className="text-right tabular-nums">{money(totalAvailable)}</TableCell>
          <TableCell>
            <UtilBar budget={total.budget} spent={total.spent} committed={total.committed} />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}

/** Phone layout — cards instead of a wide table. */
export function DepartmentList({
  rows,
  currency,
  detailed = false,
}: {
  rows: DepartmentSummary[]
  currency: string
  detailed?: boolean
}) {
  const money = (value: number, compact = false) => formatMoney(value, currency, { compact })
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground">{r.code}</div>
            </div>
            <div className="text-right">
              <div className={cn("text-sm font-semibold tabular-nums", availableClass(r.available))}>
                {money(r.available)}
              </div>
              <div className="text-xs text-muted-foreground">available</div>
            </div>
          </div>
          <UtilBar budget={r.budget} spent={r.spent} committed={r.committed} />
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Budget" value={money(r.budget, true)} />
            <Stat label="Spent" value={money(r.spent, true)} />
            <Stat label="Committed" value={money(r.committed, true)} />
          </div>
          {detailed && r.unallocated > 0 && (
            <p className="text-xs text-muted-foreground">{money(r.unallocated)} not yet allocated to budget lines</p>
          )}
        </div>
      ))}
    </div>
  )
}
