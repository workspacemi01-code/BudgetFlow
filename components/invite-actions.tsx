"use client"

import { useState, useTransition } from "react"

import { acceptInviteByToken, declineInvite } from "@/app/actions/org"
import { Spinner } from "@/components/spinner"
import { FormMessage } from "@/components/submit-button"
import { Button } from "@/components/ui/button"

/**
 * The confirm step of an invitation link. `setup` is set when the account was
 * created by the invitation itself, so it still needs a password.
 */
export function InviteDecision({ token, orgName, setup }: { token: string; orgName: string; setup: boolean }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()

  const run = (fn: () => Promise<{ error?: string } | void>) =>
    startTransition(async () => {
      setError(undefined)
      const result = await fn()
      setError(result?.error)
    })

  return (
    <div className="grid gap-3">
      <Button
        className="h-11"
        disabled={pending}
        onClick={() => run(() => acceptInviteByToken(token, setup ? "/reset-password?setup=1" : "/dashboard"))}
      >
        {pending && <Spinner />}
        {pending ? "Joining…" : `Join ${orgName}`}
      </Button>
      <Button
        variant="ghost"
        className="h-10"
        disabled={pending}
        onClick={() => run(() => declineInvite(token))}
      >
        No thanks
      </Button>
      <FormMessage error={error} />
    </div>
  )
}

/** Shown in Settings next to a pending invitation. */
export function CopyInviteLink({ url, label = "Copy invite link" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          setCopied(false)
        }
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  )
}
