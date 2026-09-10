"use client"

import Link from "next/link"
import { useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { CircleCheck, TriangleAlert } from "lucide-react"

import { createTransaction } from "@/app/actions/transactions"
import { Field, controlClass } from "@/components/field"
import { Spinner } from "@/components/spinner"
import { FormMessage } from "@/components/submit-button"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { transactionSchema, type TransactionInput } from "@/lib/validations/transaction"

export interface LineOption {
  id: string
  departmentId: string
  /** e.g. "Zest › Advertising" — the department is chosen separately. */
  name: string
  available: number
}

const today = () => new Date().toISOString().slice(0, 10)

export function TransactionForm({
  departments,
  lines,
  currency,
}: {
  departments: { id: string; name: string }[]
  lines: LineOption[]
  currency: string
}) {
  const [submitted, setSubmitted] = useState<{ code: string; amount: number; line?: string } | null>(null)
  const [serverError, setServerError] = useState<string>()
  const money = (value: number, compact = false) => formatMoney(value, currency, { compact })

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<TransactionInput>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      departmentId: departments.length === 1 ? departments[0].id : "",
      budgetLineId: "",
      txnDate: today(),
      description: "",
      vendor: "",
    },
  })

  const departmentId = useWatch({ control, name: "departmentId" })
  const budgetLineId = useWatch({ control, name: "budgetLineId" })
  const amount = useWatch({ control, name: "amount" })

  const departmentLines = lines.filter((l) => l.departmentId === departmentId)
  const line = lines.find((l) => l.id === budgetLineId)
  const overBy = line && Number.isFinite(amount) && amount > line.available ? amount - line.available : 0

  const onSubmit = async (values: TransactionInput) => {
    setServerError(undefined)
    const result = await createTransaction(values)
    if (result.error) return setServerError(result.error)
    setSubmitted({ code: result.code ?? "", amount: values.amount, line: line?.name })
  }

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <CircleCheck className="mx-auto size-10 text-primary" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{submitted.code} sent for approval</h2>
          <p className="text-sm text-muted-foreground">
            {money(submitted.amount)}
            {submitted.line && ` · ${submitted.line}`}. Finance will see it in Approvals.
          </p>
        </div>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="h-11 px-4"
            onClick={() => {
              reset()
              setSubmitted(null)
            }}
          >
            Raise another
          </Button>
          <Link href="/transactions" className={cn(buttonVariants(), "h-11 px-4")}>
            View transactions
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Department" htmlFor="departmentId" error={errors.departmentId?.message}>
          <select
            id="departmentId"
            aria-invalid={!!errors.departmentId}
            className={controlClass}
            {...register("departmentId", { onChange: () => setValue("budgetLineId", "") })}
          >
            <option value="">Choose a department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Budget line"
          htmlFor="budgetLineId"
          error={errors.budgetLineId?.message}
          hint={line ? `${money(line.available)} available on this line` : undefined}
        >
          <select
            id="budgetLineId"
            disabled={!departmentId}
            aria-invalid={!!errors.budgetLineId}
            className={cn(controlClass, "disabled:opacity-50")}
            {...register("budgetLineId")}
          >
            <option value="">{departmentId ? "Choose a budget line" : "Choose a department first"}</option>
            {departmentLines.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {money(l.available, true)} left
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Amount (${currency})`} htmlFor="amount" error={errors.amount?.message}>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            placeholder="0.00"
            aria-invalid={!!errors.amount}
            className="h-11"
            {...register("amount", { valueAsNumber: true })}
          />
        </Field>

        <Field label="Date" htmlFor="txnDate" error={errors.txnDate?.message}>
          <Input id="txnDate" type="date" aria-invalid={!!errors.txnDate} className="h-11" {...register("txnDate")} />
        </Field>
      </div>

      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <textarea
          id="description"
          rows={3}
          placeholder="What is this spend for?"
          aria-invalid={!!errors.description}
          className={cn(controlClass, "h-auto py-2")}
          {...register("description")}
        />
      </Field>

      <Field label="Vendor (optional)" htmlFor="vendor" error={errors.vendor?.message}>
        <Input id="vendor" aria-invalid={!!errors.vendor} className="h-11" {...register("vendor")} />
      </Field>

      {overBy > 0 && (
        <div
          role="alert"
          className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            This is {money(overBy)} more than the line has available. You can still submit it, but it can&apos;t be
            approved until budget is moved onto this line.
          </p>
        </div>
      )}

      <FormMessage error={serverError} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Link href="/transactions" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
          Cancel
        </Link>
        <Button type="submit" className="h-11 px-4" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {isSubmitting ? "Submitting…" : "Submit for approval"}
        </Button>
      </div>
    </form>
  )
}
