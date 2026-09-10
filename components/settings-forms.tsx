"use client"

import { useActionState, useState, useTransition } from "react"

import { inviteMember, removeMember, updateOrganization } from "@/app/actions/org"
import { Field, controlClass } from "@/components/field"
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
  org: { name: string; currency: string; brandLabel: string; allowOverBudget: boolean }
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
      <Field label="Name for the level under departments" htmlFor="org-brand" hint="Brand, Project, Cost center…">
        <Input id="org-brand" name="brandLabel" defaultValue={org.brandLabel} required maxLength={40} className="h-11" />
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
      <FormMessage
        error={state.error}
        message={
          state.message
            ? `Invitation saved. Ask ${state.message} to sign up at ${typeof window === "undefined" ? "" : window.location.origin}/signup with that email — they'll be offered to join.`
            : undefined
        }
      />
      <SubmitButton pendingLabel="Inviting…" className="justify-self-start">
        Send invitation
      </SubmitButton>
    </form>
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
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
