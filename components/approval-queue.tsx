"use client"

import { useState, useTransition } from "react"
import { Check, TriangleAlert, X } from "lucide-react"

import { approveTransaction, rejectTransaction, type ActionResult } from "@/app/actions/transactions"
import { Field, controlClass } from "@/components/field"
import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatDate, formatMoney } from "@/lib/format"
import type { Txn } from "@/lib/queries"
import { cn } from "@/lib/utils"

export interface ApprovalItem extends Txn {
  /** Available on the item's budget line right now. */
  available: number
  requester: string
}

export function ApprovalQueue({
  items,
  currency,
  canDecide,
  canApproveOverBudget,
}: {
  items: ApprovalItem[]
  currency: string
  canDecide: boolean
  canApproveOverBudget: boolean
}) {
  const [rejecting, setRejecting] = useState<ApprovalItem | null>(null)
  const [reason, setReason] = useState("")
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const money = (value: number) => formatMoney(value, currency)

  const run = (id: string, action: () => Promise<ActionResult>) => {
    setBusyId(id)
    startTransition(async () => {
      const result = await action()
      setErrors((current) => ({ ...current, [id]: result.error }))
      setBusyId(null)
    })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nothing waiting for approval.
      </p>
    )
  }

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        {items.map((item) => {
          const overBy = item.amount - item.available
          const blocked = overBy > 0 && !canApproveOverBudget
          const busy = busyId === item.id

          return (
            <Card key={item.id}>
              <CardContent className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{item.description}</div>
                    <div className="text-xs text-muted-foreground">{item.lineLabel}</div>
                  </div>
                  <div className="shrink-0 text-lg font-semibold tabular-nums">{money(item.amount)}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {[item.code, item.vendor, `raised by ${item.requester}`, formatDate(item.date)]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                {overBy > 0 ? (
                  <div className="flex gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-800 dark:bg-red-500/10 dark:text-red-300">
                    <TriangleAlert className="size-4 shrink-0" />
                    <span>
                      Over budget by {money(overBy)} — only {money(Math.max(item.available, 0))} is available on this line.
                      {blocked ? " Move budget onto it before approving." : " Approving will flag it as over budget."}
                    </span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    {money(item.available)} available · {money(item.available - item.amount)} left after approval
                  </div>
                )}
                {errors[item.id] && (
                  <p role="alert" className="text-xs text-destructive">
                    {errors[item.id]}
                  </p>
                )}
                {canDecide && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="h-10 flex-1"
                      disabled={busy}
                      onClick={() => {
                        setReason("")
                        setRejecting(item)
                      }}
                    >
                      <X />
                      Reject
                    </Button>
                    <Button
                      className="h-10 flex-1"
                      disabled={blocked || busy}
                      onClick={() => run(item.id, () => approveTransaction(item.id))}
                    >
                      {busy ? <Spinner /> : <Check />}
                      {busy ? "Saving…" : "Approve"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.code}</DialogTitle>
            <DialogDescription>
              {rejecting?.requester} will see this reason and can edit the request and send it again.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (!rejecting || reason.trim() === "") return
              const id = rejecting.id
              run(id, () => rejectTransaction(id, reason))
              setRejecting(null)
            }}
          >
            <Field label="Reason" htmlFor="reject-reason">
              <textarea
                id="reject-reason"
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cn(controlClass, "h-auto py-2")}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" className="h-10" onClick={() => setRejecting(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" className="h-10" disabled={reason.trim() === ""}>
                Reject request
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
