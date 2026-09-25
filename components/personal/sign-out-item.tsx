"use client"

import { startTransition } from "react"
import { LogOut } from "lucide-react"

import { signOut } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"

export function SignOutMenuItem() {
  return (
    <Button
      variant="outline"
      className="h-11 w-full"
      onClick={() => startTransition(() => signOut())}
    >
      <LogOut className="size-4" aria-hidden />
      Log out
    </Button>
  )
}
