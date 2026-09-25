"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"

import { addEntry, addLine } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { PersonalLine } from "@/lib/personal-math"
import { cn } from "@/lib/utils"

const CURRENCY_MARK: Record<string, string> = {
  NGN: "₦", USD: "$", GBP: "£", EUR: "€", GHS: "₵", KES: "KSh", ZAR: "R",
}

/**
 * Recording a spend, on its own screen.
 *
 * The amount comes first and is focused the moment the screen opens, so the
 * keypad is already up and the first thing you can do is type the number —
 * which is the only field you always know. Everything else has a sensible
 * default: today, already paid, and the category you tapped to get here.
 *
 * Categories are buttons rather than a dropdown. A dropdown on a phone is a
 * tap, a scroll and a second tap; eight chips are one tap and you can see all
 * your options at once.
 */
export function AddSpendScreen({
  budgetId,
  lines,
  currency,
  presetLineId,
}: {
  budgetId: string
  lines: PersonalLine[]
  currency: string
  presetLineId?: string
}) {
  const router = useRouter()
  const [state, action] = useActionState(addEntry, {})
  const [lineId, setLineId] = useState(presetLineId ?? lines[0]?.id ?? "")
  const [addingCategory, setAddingCategory] = useState(false)
  const amountRef = useRef<HTMLInputElement>(null)
  const mark = CURRENCY_MARK[currency] ?? currency

  // Focused by hand rather than with the autoFocus attribute, because
  // autoFocus scrolls the element into view — on a phone that yanks the page
  // as it settles, and again after every re-render that remounts the input.
  // preventScroll puts the keypad up without moving anything.
  useEffect(() => {
    amountRef.current?.focus({ preventScroll: true })
  }, [])

  // A category made here should be the one selected, and the caret should go
  // straight back to the amount — that is where you were.
  const onCategoryCreated = (id: string) => {
    setLineId(id)
    setAddingCategory(false)
    amountRef.current?.focus({ preventScroll: true })
  }

  // A saved spend sends you back to where the number is, so you see it land.
  useEffect(() => {
    if (state.message) router.push(`/personal/${budgetId}`)
  }, [state.message, budgetId, router])

  if (lines.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Add something to budget for first — rent, food, transport.
          </p>
          <a
            href={`/personal/${budgetId}/budget`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground"
          >
            Set up your budget
          </a>
        </CardContent>
      </Card>
    )
  }

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="budgetId" value={budgetId} />
      <input type="hidden" name="lineId" value={lineId} />

      <div className="pt-4 text-center">
        <Label htmlFor="amount" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          How much?
        </Label>
        <div className="mt-2 flex items-center justify-center gap-1">
          <span className="text-3xl font-semibold text-muted-foreground">{mark}</span>
          <input
            ref={amountRef}
            id="amount"
            name="amount"
            inputMode="decimal"
            placeholder="0"
            required
            className="w-44 border-0 bg-transparent p-0 text-center text-5xl font-bold tabular-nums outline-none placeholder:text-muted-foreground/40 focus:ring-0"
          />
        </div>
      </div>

      <FormMessage error={state.error} />

      <fieldset>
        <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          What for?
        </legend>
        <div className="flex flex-wrap gap-2">
          {lines.map((line) => (
            <button
              key={line.id}
              type="button"
              onClick={() => setLineId(line.id)}
              aria-pressed={lineId === line.id}
              className={cn(
                "h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                lineId === line.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-card active:bg-muted"
              )}
            >
              {line.name}
            </button>
          ))}

          {/* Missing an envelope is the commonest reason to abandon recording a
              spend. Make one here instead of losing what you already typed. */}
          <button
            type="button"
            onClick={() => setAddingCategory((v) => !v)}
            aria-expanded={addingCategory}
            className="h-11 rounded-full border border-dashed px-4 text-sm font-medium text-muted-foreground active:bg-muted"
          >
            + New
          </button>
        </div>

        {addingCategory && (
          <NewCategory
            budgetId={budgetId}
            currencyMark={mark}
            onCreated={onCategoryCreated}
            onCancel={() => setAddingCategory(false)}
          />
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="description" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Note
        </Label>
        <Input
          id="description"
          name="description"
          placeholder="Optional — lunch, fuel, data…"
          className="h-12 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="spentOn" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          When
        </Label>
        <Input
          id="spentOn"
          name="spentOn"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="h-12 text-base"
        />
      </div>

      <label className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
        <input type="checkbox" name="paid" defaultChecked className="size-5" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Already paid</span>
          <span className="block text-[11px] text-muted-foreground">
            Turn this off for something you owe but haven&apos;t paid yet.
          </span>
        </span>
      </label>

      <SubmitButton className="h-14 w-full text-base" pendingLabel="Saving…">
        Save spend
      </SubmitButton>
    </form>
  )
}

/**
 * Make a category without leaving the spend you are halfway through typing.
 *
 * Deliberately not a <form>: this sits inside the spend form, and a form nested
 * in a form is invalid HTML — the browser throws the inner one away, so the
 * button would have submitted the spend instead. It calls the action directly
 * with a FormData it builds itself, which is what a nested form would have done
 * anyway, minus the markup that cannot exist.
 */
function NewCategory({
  budgetId,
  currencyMark,
  onCreated,
  onCancel,
}: {
  budgetId: string
  currencyMark: string
  onCreated: (id: string) => void
  onCancel: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const plannedRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true })
  }, [])

  const submit = () => {
    const name = nameRef.current?.value.trim() ?? ""
    if (!name) {
      setError("Give it a name — Airtime, Data, Rent.")
      return
    }
    setError(null)
    startTransition(async () => {
      const data = new FormData()
      data.set("budgetId", budgetId)
      data.set("name", name)
      data.set("planned", plannedRef.current?.value ?? "")
      const result = await addLine({}, data)
      if (result.error) setError(result.error)
      else if (result.createdId) onCreated(result.createdId)
    })
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border bg-muted/30 p-3">
      <FormMessage error={error ?? undefined} />
      <div className="flex gap-2">
        <Input
          ref={nameRef}
          placeholder="Name — Airtime, Data…"
          aria-label="Category name"
          className="h-12 min-w-0 flex-1 text-base"
          // Enter should finish the category, not submit the spend behind it.
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              submit()
            }
          }}
        />
        <Input
          ref={plannedRef}
          inputMode="decimal"
          placeholder={`${currencyMark} budget`}
          aria-label="Amount to budget for it"
          className="h-12 w-32 shrink-0 text-base"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" className="h-10" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" className="h-10" onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add category"}
        </Button>
      </div>
    </div>
  )
}
