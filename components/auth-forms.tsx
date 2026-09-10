"use client"

import Link from "next/link"
import { useActionState } from "react"
import { MailCheck } from "lucide-react"

import { requestPasswordReset, signIn, signUp, updatePassword } from "@/app/actions/auth"
import { createOrganization } from "@/app/actions/org"
import { Field, controlClass } from "@/components/field"
import { PasswordInput } from "@/components/password-input"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Input } from "@/components/ui/input"
import { CURRENCIES } from "@/lib/format"
import type { FormState } from "@/lib/types"

const initial: FormState = {}

function CheckEmail({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 text-center">
      <MailCheck className="mx-auto size-10 text-primary" />
      <h2 className="text-lg font-semibold">Check your email</h2>
      <p className="text-sm text-muted-foreground">
        We sent a link to <span className="font-medium text-foreground">{email}</span>. {children}
      </p>
    </div>
  )
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signIn, initial)
  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </Field>
      <div className="grid gap-1.5">
        <Field label="Password" htmlFor="password">
          <PasswordInput id="password" name="password" autoComplete="current-password" required />
        </Field>
        <Link href="/forgot-password" className="justify-self-end text-xs font-medium text-primary hover:underline">
          Forgot password?
        </Link>
      </div>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  )
}

export function SignupForm() {
  const [state, action] = useActionState(signUp, initial)

  if (state.message) {
    return (
      <CheckEmail email={state.message}>Open it on this device to finish setting up your account.</CheckEmail>
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
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Creating account…">Create account</SubmitButton>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial)

  if (state.message) {
    return (
      <CheckEmail email={state.message}>
        If there&apos;s an account for it, the link lets you choose a new password. It works once, on this device.
      </CheckEmail>
    )
  }

  return (
    <form action={action} className="grid gap-4">
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11" />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  )
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial)
  return (
    <form action={action} className="grid gap-4">
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Saving…">Save new password</SubmitButton>
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
