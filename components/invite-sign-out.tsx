"use client"

import { signOut } from "@/app/actions/auth"
import { SubmitButton } from "@/components/submit-button"

/** Signing out from the invitation page, so the right address can accept it. */
export function SignOutLink() {
  return (
    <form action={signOut}>
      <SubmitButton variant="outline" pendingLabel="Signing out…" className="w-full">
        Sign out and switch account
      </SubmitButton>
    </form>
  )
}
