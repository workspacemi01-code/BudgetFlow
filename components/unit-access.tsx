"use client"

import { useActionState, useState } from "react"

import { setMemberUnits, setUnitOfficerAccess } from "@/app/actions/org"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ROLE_LABELS } from "@/lib/roles"
import type { FormState, Role } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface UnitOption {
  id: string
  name: string
  departmentId: string
  /** The department it sits in, so a bare unit name is placeable. */
  path: string
  officersCanSpend: boolean
}

export interface UnitMember {
  membershipId: string
  name: string
  role: Role
  unitIds: string[]
}

function Note({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-destructive">{state.error}</p>
  if (state.message) return <p className="text-sm text-muted-foreground">{state.message}</p>
  return null
}

/**
 * Assigning people to units.
 *
 * Only unit-scoped roles appear here. A department manager's access is already
 * decided by their departments, and giving them a unit list as well would
 * suggest it narrows them, which it does not.
 */
export function MemberUnits({
  members,
  units,
}: {
  members: UnitMember[]
  units: UnitOption[]
}) {
  const [state, action, pending] = useActionState(setMemberUnits, {} as FormState)
  const [selected, setSelected] = useState(members[0]?.membershipId ?? "")

  const member = members.find((m) => m.membershipId === selected)

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nobody has a unit-scoped role yet. Invite someone as a{" "}
        {ROLE_LABELS.line_manager.toLowerCase()} or an {ROLE_LABELS.officer.toLowerCase()} and they
        will appear here.
      </p>
    )
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="unit-member">Person</Label>
        <select
          id="unit-member"
          name="membershipId"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        >
          {members.map((m) => (
            <option key={m.membershipId} value={m.membershipId}>
              {m.name} — {ROLE_LABELS[m.role]}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Units they work in</legend>
        <p className="text-sm text-muted-foreground">
          They can see every unit in the departments these sit in. These are the ones they
          can act in.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {units.map((u) => (
            <label
              key={u.id}
              className="flex items-start gap-2 rounded-md border p-2.5 text-sm has-checked:border-primary has-checked:bg-accent"
            >
              <input
                type="checkbox"
                name="unitIds"
                value={u.id}
                /* Keyed on the member so switching person resets the boxes to
                   that person's own units rather than keeping the last one's. */
                defaultChecked={member?.unitIds.includes(u.id)}
                key={`${selected}-${u.id}`}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block font-medium">{u.name}</span>
                <span className="block text-xs text-muted-foreground">{u.path}</span>
                {!u.officersCanSpend && (
                  <span className="mt-1 block text-xs text-destructive">Closed to officers</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save units"}
        </Button>
        <Note state={state} />
      </div>
    </form>
  )
}

/**
 * Closing a unit to officers.
 *
 * This is the rule the business described as "officers can't spend within the
 * Sosa budget", as a control rather than a deployment. It changes nothing else:
 * officers still see the unit, and every other role still spends against it.
 */
export function UnitSpendRules({ units }: { units: UnitOption[] }) {
  const [state, action, pending] = useActionState(setUnitOfficerAccess, {} as FormState)

  if (units.length === 0) {
    return <p className="text-sm text-muted-foreground">No units yet.</p>
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Unit officers spend only in the units they are attached to. Closing one here stops them
        spending against it — they can still see it, and everyone else is unaffected.
      </p>

      <ul className="divide-y rounded-md border">
        {units.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{u.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {u.path}
                {" · "}
                <span className={cn(!u.officersCanSpend && "text-destructive")}>
                  {u.officersCanSpend ? "Open to officers" : "Closed to officers"}
                </span>
              </div>
            </div>
            <form action={action}>
              <input type="hidden" name="unitId" value={u.id} />
              <input type="hidden" name="allowed" value={u.officersCanSpend ? "false" : "true"} />
              <Button type="submit" variant="outline" size="sm" disabled={pending}>
                {u.officersCanSpend ? "Close to officers" : "Open to officers"}
              </Button>
            </form>
          </li>
        ))}
      </ul>

      <Note state={state} />
    </div>
  )
}
