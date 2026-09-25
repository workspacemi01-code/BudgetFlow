"use client"

import { useActionState, useState, useTransition } from "react"

import { inviteMember, removeMember, resendInvite, updateOrganization } from "@/app/actions/org"
import { Field, controlClass } from "@/components/field"
import { CopyInviteLink } from "@/components/invite-actions"
import { Spinner } from "@/components/spinner"
import { FormMessage, SubmitButton } from "@/components/submit-button"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CURRENCIES } from "@/lib/format"
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles"
import type { FormState, Role } from "@/lib/types"

const initial: FormState = {}

export function OrgSettingsForm({
  org,
}: {
  org: { name: string; currency: string; allowOverBudget: boolean }
}) {
  const [state, action] = useActionState(updateOrganization, initial)
  return (
    <form action={action} className="grid gap-4">
      <Field label="Organization name" htmlFor="org-name">
        <Input id="org-name" name="name" defaultValue={org.name} required className="h-11" />
      </Field>
      <Field label="Currency" htmlFor="org-currency">
        <select id="org-currency" name="currency" defaultValue={org.currency} className={controlClass}>
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="allowOverBudget"
          defaultChecked={org.allowOverBudget}
          className="mt-0.5 size-4 accent-[var(--primary)]"
        />
        <span>
          <span className="font-medium">Allow over-budget approvals</span>
          <span className="block text-xs text-muted-foreground">
            Owners and admins may approve spend above a line&apos;s available budget. It is flagged as over budget.
          </span>
        </span>
      </label>
      <FormMessage error={state.error} message={state.message} />
      <SubmitButton pendingLabel="Saving…" className="justify-self-start">
        Save settings
      </SubmitButton>
    </form>
  )
}

export function InviteForm({ roles, departments }: { roles: Role[]; departments: { id: string; name: string }[] }) {
  const [state, action] = useActionState(inviteMember, initial)
  const [role, setRole] = useState<Role>("finance")
  const scoped = role === "dept_manager" || role === "viewer"

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" htmlFor="invite-email">
          <Input id="invite-email" name="email" type="email" required className="h-11" placeholder="name@company.com" />
        </Field>
        <Field label="Role" htmlFor="invite-role" hint={ROLE_DESCRIPTIONS[role]}>
          <select
            id="invite-role"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={controlClass}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {scoped && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">
            {role === "dept_manager" ? "Departments they manage" : "Limit to departments (optional)"}
          </legend>
          {departments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Add departments first.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="departmentIds" value={d.id} className="size-4 accent-[var(--primary)]" />
                  {d.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <FormMessage error={state.error} warning={state.warning} message={state.message} />
      {state.inviteUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2.5">
          <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{state.inviteUrl}</code>
          <CopyInviteLink url={state.inviteUrl} label="Copy link" />
        </div>
      )}
      <SubmitButton pendingLabel="Inviting…" className="justify-self-start">
        Send invitation
      </SubmitButton>
    </form>
  )
}

/** Sends a pending invitation again and gives it another 7 days. */
export function ResendInviteButton({ membershipId, inviteUrl }: { membershipId: string; inviteUrl: string }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<FormState>({})

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-2">
        <CopyInviteLink url={inviteUrl} label="Copy link" />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => startTransition(async () => setState((await resendInvite(membershipId)) ?? {}))}
        >
          {pending ? "Sending…" : "Resend"}
        </Button>
      </div>
      {(state.error || state.warning || state.message) && (
        <p className={`text-xs ${state.error || state.warning ? "text-destructive" : "text-muted-foreground"}`}>
          {state.error ?? state.warning ?? state.message}
        </p>
      )}
    </div>
  )
}

export function RemoveMemberButton({ membershipId, label }: { membershipId: string; label: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove ${label}?`)) return
          startTransition(async () => setError((await removeMember(membershipId)).error))
        }}
      >
        {pending && <Spinner />}
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
