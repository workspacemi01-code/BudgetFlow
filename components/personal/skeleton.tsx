import { cn } from "@/lib/utils"

/**
 * A placeholder block with a light sweeping across it.
 *
 * One component so every loading screen shimmers at the same speed — two
 * animations slightly out of step is more distracting than either alone.
 */
export function Block({ className }: { className?: string }) {
  return <div className={cn("bf-skeleton rounded-xl", className)} />
}

/**
 * The bar across the top of a loading screen.
 *
 * The blocks below say "something is coming"; this says "and it is moving".
 * Deliberately indeterminate — we do not know how long the database will take,
 * and a bar that claims to know, then stalls at 80%, is worse than one that
 * never claimed.
 */
export function LoadingBar() {
  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent"
    >
      <div className="bf-skeleton h-full w-full rounded-none bg-primary/30" />
    </div>
  )
}
