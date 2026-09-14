"use client"

import { useState, useTransition } from "react"

import { acceptInviteByToken } from "@/app/actions/org"
import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"

/** One-click join from the list of invitations waiting for this address. */
export function AcceptInviteButton({ token }: { token: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  return (
    <div className="space-y-1">
      <Button
        className="h-10 px-4"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInviteByToken(token)
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
