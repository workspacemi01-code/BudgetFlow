import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { TransactionForm } from "@/components/transaction-form"
import { Card, CardContent } from "@/components/ui/card"
import { getLineTotals } from "@/lib/queries"
import { canRaiseSpend } from "@/lib/roles"
import { requireOrg } from "@/lib/session"

export const metadata: Metadata = { title: "New transaction" }

export default async function NewTransactionPage() {
  const ctx = await requireOrg()
  const allowed = canRaiseSpend(ctx.role)
  const lines = allowed ? await getLineTotals(ctx) : []
  const departments = [...new Map(lines.map((l) => [l.departmentId, { id: l.departmentId, name: l.departmentName }])).values()]

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New transaction"
        description="Raise spend against a budget line. It counts against the budget once Finance approves it."
      />
      <Card>
        <CardContent>
          {!allowed ? (
            <p className="text-sm text-muted-foreground">Viewers can see spend but can&apos;t raise it.</p>
          ) : lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              There are no budget lines to raise spend against yet.{" "}
              <Link href="/budget-lines" className="font-medium text-primary hover:underline">
                Add a budget line
              </Link>{" "}
              first.
            </p>
          ) : (
            <TransactionForm
              currency={ctx.org.currency}
              departments={departments}
              lines={lines.map((l) => ({
                id: l.id,
                departmentId: l.departmentId,
                name: [l.brandName, l.categoryName].filter(Boolean).join(" › "),
                available: l.available,
              }))}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
