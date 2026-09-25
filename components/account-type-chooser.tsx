"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Building2, User } from "lucide-react"

import { startBudget } from "@/app/actions/personal"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { CURRENCIES } from "@/lib/format"
import { cn } from "@/lib/utils"

type Kind = "business" | "individual"

/**
 * Step two of signing up: who is this budget for?
 *
 * The two answers lead somewhere genuinely different — a company gets
 * departments, budget lines and an approval chain; a person gets this month's
 * rent and whether they have gone over. Asking once here is what keeps the
 * individual side free of concepts it has no use for.
 */
export function AccountTypeChooser({ email, confirmed }: { email: string; confirmed: boolean }) {
  const [kind, setKind] = useState<Kind | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">What are you budgeting?</CardTitle>
        <CardDescription>Signed in as {email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {confirmed && <FormMessage message="Your email is confirmed — welcome to BudgetFlow." />}

        <div className="grid gap-3">
          <Choice
            selected={kind === "individual"}
            onSelect={() => setKind("individual")}
            icon={<User className="size-5" aria-hidden />}
            title="My own money"
            blurb="Rent, food, transport. Set an amount for each, record what you spend, see what's left."
          />
          <Choice
            selected={kind === "business"}
            onSelect={() => setKind("business")}
            icon={<Building2 className="size-5" aria-hidden />}
            title="A company"
            blurb="Departments, budget lines and spend that goes through approval."
          />
        </div>

        {kind === "individual" && <IndividualSetup />}
        {kind === "business" && (
          <Link
            href="/create-org"
            className="flex h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continue
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function Choice({
  selected,
  onSelect,
  icon,
  title,
  blurb,
}: {
  selected: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  blurb: string
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      )}
    >
      <span className={cn("mt-0.5 shrink-0", selected ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
      </span>
    </button>
  )
}

/**
 * Monthly or yearly, and in what currency. That is everything needed to open
 * the first budget — the categories are seeded so the next screen has something
 * on it, and they can all be renamed or removed.
 */
function IndividualSetup() {
  const [state, action] = useActionState(startBudget, {})

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-muted/30 p-4">
      <FormMessage error={state.error} />

      <fieldset className="space-y-1.5">
        <legend className="mb-1.5 text-xs font-semibold">How do you want to budget?</legend>
        <div className="grid grid-cols-2 gap-2">
          <CadenceOption value="monthly" defaultChecked label="Monthly" hint="A fresh budget each month" />
          <CadenceOption value="yearly" label="Yearly" hint="One budget for the whole year" />
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="currency" className="text-xs font-semibold">
          Currency
        </Label>
        <select
          id="currency"
          name="currency"
          defaultValue="NGN"
          className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
      </div>

      <SubmitButton className="w-full" pendingLabel="Setting up…">
        Create my budget
      </SubmitButton>
    </form>
  )
}

function CadenceOption({
  value,
  label,
  hint,
  defaultChecked,
}: {
  value: string
  label: string
  hint: string
  defaultChecked?: boolean
}) {
  return (
    <label className="flex cursor-pointer flex-col rounded-lg border bg-background p-3 text-left has-checked:border-primary has-checked:bg-primary/5">
      <span className="flex items-center gap-2">
        <input type="radio" name="cadence" value={value} defaultChecked={defaultChecked} className="size-4" />
        <span className="text-sm font-medium">{label}</span>
      </span>
      <span className="mt-1 pl-6 text-[11px] text-muted-foreground">{hint}</span>
    </label>
  )
}
