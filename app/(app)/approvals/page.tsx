import type { Metadata } from "next"

import { ApprovalQueue } from "@/components/approval-queue"
import { PageHeader } from "@/components/page-header"
import { PaymentQueue } from "@/components/payment-queue"
import { getLineTotals, getTransactions, profileNames } from "@/lib/queries"
import { isAdmin, isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"

export const metadata: Metadata = { title: "Approvals" }

export default async function ApprovalsPage() {
  const ctx = await requireOrg()
  const approver = isApprover(ctx.role)
  const [pending, toPay, lines] = await Promise.all([
    getTransactions(ctx, { statuses: ["pending"] }),
    approver ? getTransactions(ctx, { statuses: ["approved", "partially_paid"] }) : Promise.resolve([]),
    getLineTotals(ctx),
  ])

  const available = new Map(lines.map((l) => [l.id, l.available]))
  const names = await profileNames([...new Set(pending.map((t) => t.createdBy).filter((id): id is string => !!id))])
  const items = pending
    .slice()
    .reverse() // oldest request first
    .map((t) => ({
      ...t,
      available: available.get(t.lineId) ?? 0,
      requester: (t.createdBy && names.get(t.createdBy)?.name) || "a former member",
    }))

  return (
    <>
      <PageHeader
        title="Approvals"
        description={
          approver
            ? "Spend waiting for a decision. Approved money is committed against its budget line straight away."
            : "Spend waiting for Finance. Only owners, admins and finance can approve."
        }
      />
      <ApprovalQueue
        items={items}
        currency={ctx.org.currency}
        canDecide={approver}
        canApproveOverBudget={ctx.org.allow_over_budget && isAdmin(ctx.role)}
      />

      {approver && (
        <section className="mt-8 space-y-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">To pay</h2>
            <p className="text-sm text-muted-foreground">
              Approved spend with money still to pay out. Recording a payment moves it from committed to spent.
            </p>
          </div>
          <PaymentQueue items={toPay} currency={ctx.org.currency} />
        </section>
      )}
    </>
  )
}
