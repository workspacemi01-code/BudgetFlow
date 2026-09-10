"use client"

import Link from "next/link"
import { useTransition } from "react"
import { RotateCw, TriangleAlert } from "lucide-react"

import { Spinner } from "@/components/spinner"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Friendly fallback for a page that failed to load, with a retry. */
export function ErrorView({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition()
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
      <TriangleAlert className="size-8 text-amber-500" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Something went wrong loading this page</h2>
        <p className="text-sm text-muted-foreground">
          It may be a slow or dropped connection. Try again — if it keeps happening, share this code with support:{" "}
          <span className="font-mono text-foreground">{error.digest ?? "no code"}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button className="h-10 px-4" disabled={pending} onClick={() => startTransition(() => retry())}>
          {pending ? <Spinner /> : <RotateCw />}
          Try again
        </Button>
        <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-10 px-4")}>
          Go to dashboard
        </Link>
      </div>
    </div>
  )
}
