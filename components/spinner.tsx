import { LoaderCircle } from "lucide-react"

import { cn } from "@/lib/utils"

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn("size-4 animate-spin", className)} />
}

/** Dims the screen while something app-wide happens (switching organization, signing out). */
export function BusyOverlay({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm"
    >
      <Spinner className="size-6 text-primary" />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  )
}
