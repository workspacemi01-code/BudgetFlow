"use client"

import { useMemo, useState } from "react"
import { Search } from "lucide-react"

import { ExportCsvButton } from "@/components/export-csv-button"
import { controlClass } from "@/components/field"
import { STATUS_LABELS, StatusBadge } from "@/components/status-badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatDate, formatMoney } from "@/lib/format"
import type { Txn } from "@/lib/queries"
import type { TxnStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const ALL = "all"

const CSV_HEADER = ["Code", "Date", "Department", "Budget line", "Description", "Vendor", "Amount", "Paid", "Status"]

export function TransactionsTable({
  rows,
  departments,
  currency,
  initialQuery = "",
}: {
  rows: Txn[]
  departments: string[]
  currency: string
  initialQuery?: string
}) {
  const [query, setQuery] = useState(initialQuery)
  const [status, setStatus] = useState<TxnStatus | typeof ALL>(ALL)
  const [department, setDepartment] = useState(ALL)
  const money = (value: number) => formatMoney(value, currency)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (t) =>
        (status === ALL || t.status === status) &&
        (department === ALL || t.departmentName === department) &&
        (q === "" ||
          [t.code, t.description, t.vendor ?? "", t.lineLabel].some((field) => field.toLowerCase().includes(q)))
    )
  }, [rows, query, status, department])

  const csvRows = filtered.map((t) => [
    t.code,
    t.date,
    t.departmentName,
    t.lineLabel,
    t.description,
    t.vendor ?? "",
    t.amount,
    t.paid,
    STATUS_LABELS[t.status],
  ])

  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No transactions yet this period.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search code, description, vendor…"
            aria-label="Search transactions"
            className="h-11 pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 md:flex">
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TxnStatus | typeof ALL)}
            className={cn(controlClass, "md:w-40")}
          >
            <option value={ALL}>All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className={cn(controlClass, "md:w-44")}
          >
            <option value={ALL}>All departments</option>
            {departments.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <ExportCsvButton filename="transactions.csv" header={CSV_HEADER} rows={csvRows} />
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {rows.length} transactions
      </p>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No transactions match these filters.
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Budget line</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="max-w-72">
                      <div className="truncate font-medium">{t.description}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[t.code, t.vendor].filter(Boolean).join(" · ")}
                      </div>
                      {t.status === "rejected" && t.rejectionReason && (
                        <div className="truncate text-xs text-red-700 dark:text-red-300">{t.rejectionReason}</div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{t.lineLabel}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(t.date)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{money(t.amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(t.paid)}</TableCell>
                    <TableCell>
                      <StatusBadge status={t.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10 md:hidden">
            {filtered.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{t.description}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.lineLabel}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.code} · {formatDate(t.date)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-semibold tabular-nums">{money(t.amount)}</span>
                  <StatusBadge status={t.status} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
