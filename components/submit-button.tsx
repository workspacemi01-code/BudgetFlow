"use client"

import { useFormStatus } from "react-dom"

import { Spinner } from "@/components/spinner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Submit button that disables itself while its form's server action runs. */
export function SubmitButton({
  children,
  pendingLabel = "Working…",
  variant,
  className,
}: {
  children: React.ReactNode
  pendingLabel?: string
  variant?: "default" | "outline" | "destructive"
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} disabled={pending} className={cn("h-11 px-4", className)}>
      {pending ? (
        <>
          <Spinner />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  )
}

export function FormMessage({ error, warning, message }: { error?: string; warning?: string; message?: string }) {
  if (error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-2.5 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
        {error}
      </p>
    )
  }
  if (warning) {
    return (
      <p
        role="status"
        className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
      >
        {warning}
      </p>
    )
  }
  if (message) {
    return (
      <p
        role="status"
        className="rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"
      >
        {message}
      </p>
    )
  }
  return null
}
