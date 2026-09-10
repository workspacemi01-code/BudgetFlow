"use client"

import { useActionState } from "react"
import { MailCheck } from "lucide-react"

import { signIn, signUp } from "@/app/actions/auth"
import { createOrganization } from "@/app/actions/org"
import { Field, controlClass } from "@/components/field"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { CURRENCIES } from "@/lib/format"
import type { FormState } from "@/lib/types"

const initial: FormState = {}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial)
  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  )
}

export function SignupForm() {
  const [state, action] = useActionState(signUp, initial)

  if (state.message) {
    return (
      <div className="space-y-3 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <span className="font-medium text-foreground">{state.message}</span>. Open it
          on this device to finish setting up your account.
        </p>
      </div>
    )
  }

  return (
    <form action={action} className="grid gap-4">
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required className="h-11" />
      </Field>
      <Field label="Work email" htmlFor="email" hint="We'll send a link to confirm it.">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-11"
        />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, i, 1)))
)

export function CreateOrgForm() {
  const [state, action] = useActionState(createOrganization, initial)
  return (
    <form action={action} className="grid gap-4">
      <Field label="Organization name" htmlFor="org-name">
        <Input id="org-name" name="name" autoComplete="organization" required minLength={2} className="h-11" />
      </Field>
      <Field label="Currency" htmlFor="currency">
        <select id="currency" name="currency" defaultValue="NGN" className={controlClass}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Financial year starts in" htmlFor="fy-start">
        <select id="fy-start" name="fyStart" defaultValue="1" className={controlClass}>
          {MONTHS.map((month, i) => (
            <option key={month} value={i + 1}>
              {month}
            </option>
          ))}
        </select>
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Creating…">Create organization</SubmitButton>
    </form>
  )
}
