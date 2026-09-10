"use client"

import { useState, useTransition } from "react"

import { acceptInvite } from "@/app/actions/org"
import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"

export function AcceptInviteButton({ membershipId }: { membershipId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  return (
    <div className="space-y-1">
      <Button
        className="h-10 px-4"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvite(membershipId)
            setError(result?.error)
          })
        }
      >
        {pending && <Spinner />}
        {pending ? "Joining…" : "Join"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
