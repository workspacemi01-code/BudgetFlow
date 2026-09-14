"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { MailCheck } from "lucide-react"

import { requestPasswordReset, resendConfirmation, signIn, signUp, updatePassword } from "@/app/actions/auth"
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

/** "Didn't get it?" — sends another confirmation link to a known address. */
export function ResendConfirmationButton({ email, next }: { email: string; next?: string }) {
  const [state, action] = useActionState(resendConfirmation, initial)
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="email" value={email} />
      {next && <input type="hidden" name="next" value={next} />}
      <FormMessage error={state.error} message={state.message} />
      <SubmitButton variant="outline" pendingLabel="Sending…">
        Resend confirmation email
      </SubmitButton>
    </form>
  )
}

/** For an expired link: ask for the email, then send a new confirmation link. */
export function ResendConfirmationForm() {
  const [state, action] = useActionState(resendConfirmation, initial)
  return (
    <form action={action} className="grid gap-3">
      <Field label="Email you signed up with" htmlFor="resend-email">
        <Input id="resend-email" name="email" type="email" autoComplete="email" required className="h-11" />
      </Field>
      <FormMessage error={state.error} message={state.message} />
      <SubmitButton variant="outline" pendingLabel="Sending…">
        Send a new confirmation link
      </SubmitButton>
    </form>
  )
}

export function LoginForm({ next, email }: { next?: string; email?: string }) {
  const [state, action] = useActionState(signIn, initial)
  return (
    <div className="grid gap-4">
      <form action={action} className="grid gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Work email" htmlFor="email" hint={email ? "The address your invitation was sent to." : undefined}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="h-11"
            defaultValue={email}
            readOnly={!!email}
          />
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
      {state.unconfirmedEmail && <ResendConfirmationButton email={state.unconfirmedEmail} next={next} />}
    </div>
  )
}

export function SignupForm({ next, email }: { next?: string; email?: string }) {
  // Remounting (new key) resets the form's action state for "Use a different email".
  const [attempt, setAttempt] = useState(0)
  return <SignupFormInner key={attempt} next={next} email={email} onStartOver={() => setAttempt((n) => n + 1)} />
}

function SignupFormInner({
  next,
  email,
  onStartOver,
}: {
  next?: string
  email?: string
  onStartOver: () => void
}) {
  const [state, action] = useActionState(signUp, initial)

  if (state.message) {
    return (
      <div className="grid gap-4">
        <CheckEmail email={state.message}>
          Click the button in that email to confirm your account — it works on any device.
        </CheckEmail>
        <ResendConfirmationButton email={state.message} next={next} />
        {!email && (
          <button type="button" onClick={onStartOver} className="text-center text-sm font-medium text-primary hover:underline">
            Use a different email
          </button>
        )}
      </div>
    )
  }

  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="Your name" htmlFor="name">
        <Input id="name" name="name" autoComplete="name" required className="h-11" />
      </Field>
      <Field label="Work email" htmlFor="email" hint={email ? "The address your invitation was sent to." : undefined}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11"
          defaultValue={email}
          readOnly={!!email}
        />
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
        If there&apos;s an account for it, the button in that email lets you choose a new password. The link works
        once and expires after an hour.
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

export function ResetPasswordForm({
  next,
  label = "New password",
  submitLabel = "Save new password",
}: {
  next?: string
  label?: string
  submitLabel?: string
}) {
  const [state, action] = useActionState(updatePassword, initial)
  return (
    <form action={action} className="grid gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={label} htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label={`Confirm ${label.toLowerCase()}`} htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" minLength={8} required />
      </Field>
      <FormMessage error={state.error} />
      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
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
