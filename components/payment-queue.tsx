"use client"

import { useActionState, useState } from "react"
import { Banknote } from "lucide-react"

import { recordPayment } from "@/app/actions/transactions"
import { Field, controlClass } from "@/components/field"
import { StatusBadge } from "@/components/status-badge"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { formatDate, formatMoney } from "@/lib/format"
import type { Txn } from "@/lib/queries"
import type { FormState } from "@/lib/types"

const METHODS = ["Bank transfer", "Card", "Cash", "Cheque", "Other"]

function PaymentForm({ txn, currency, onDone }: { txn: Txn; currency: string; onDone: () => void }) {
  const remaining = txn.amount - txn.paid
  const [state, action] = useActionState(async (_: FormState, formData: FormData): Promise<FormState> => {
    const result = await recordPayment({
      transactionId: txn.id,
      amount: Number(formData.get("amount")),
      paidOn: String(formData.get("paidOn") ?? ""),
      method: String(formData.get("method") ?? "") || null,
      reference: String(formData.get("reference") ?? "").trim() || null,
    })
    if (!result.error) onDone()
    return result
  }, {})

  return (
    <form action={action} className="grid gap-4">
      <Field
        label={`Amount paid (${currency})`}
        htmlFor="pay-amount"
        hint={`${formatMoney(remaining, currency)} still to pay`}
      >
        <Input
          id="pay-amount"
          name="amount"
          type="number"
          min={0.01}
          max={remaining}
          step="0.01"
          defaultValue={remaining}
          required
          className="h-11"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Paid on" htmlFor="pay-date">
          <Input
            id="pay-date"
            name="paidOn"
            type="date"
            required
            defaultValue={new Date().toISOString().slice(0, 10)}
            className="h-11"
          />
        </Field>
        <Field label="Method" htmlFor="pay-method">
          <select id="pay-method" name="method" defaultValue="Bank transfer" className={controlClass}>
            {METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Reference (optional)" htmlFor="pay-ref">
        <Input id="pay-ref" name="reference" className="h-11" placeholder="Bank reference or receipt number" />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Saving…">Record payment</SubmitButton>
    </form>
  )
}

/** Approved spend that still has money to pay out. */
export function PaymentQueue({ items, currency }: { items: Txn[]; currency: string }) {
  const [paying, setPaying] = useState<Txn | null>(null)
  const money = (value: number) => formatMoney(value, currency)

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing approved is waiting to be paid.</p>
  }

  return (
    <>
      <ul className="divide-y rounded-xl bg-card px-4 ring-1 ring-foreground/10">
        {items.map((t) => (
          <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="truncate font-medium">{t.description}</div>
              <div className="truncate text-xs text-muted-foreground">
                {t.code} · {t.lineLabel} · {formatDate(t.date)}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums">{money(t.amount - t.paid)}</div>
                <div className="text-xs text-muted-foreground">of {money(t.amount)} to pay</div>
              </div>
              <StatusBadge status={t.status} />
              <Button variant="outline" className="h-10" onClick={() => setPaying(t)}>
                <Banknote />
                Pay
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog open={paying !== null} onOpenChange={(open) => !open && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment · {paying?.code}</DialogTitle>
            <DialogDescription>{paying?.description}</DialogDescription>
          </DialogHeader>
          {paying && <PaymentForm key={paying.id} txn={paying} currency={currency} onDone={() => setPaying(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}
