import { formatPercent } from "@/lib/format"
import { cn } from "@/lib/utils"

/** Stacked bar: spent (primary) + committed (amber) as a share of budget. */
export function UtilBar({
  budget,
  spent,
  committed,
  showLabel = true,
  className,
}: {
  budget: number
  spent: number
  committed: number
  showLabel?: boolean
  className?: string
}) {
  const share = (value: number) => (budget > 0 ? Math.min((value / budget) * 100, 100) : 0)
  const used = budget > 0 ? ((spent + committed) / budget) * 100 : 0
  const spentWidth = share(spent)
  const committedWidth = Math.min(share(committed), 100 - spentWidth)
  const tone =
    used >= 100 ? "text-red-600 dark:text-red-400" : used >= 80 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        role="meter"
        aria-label="Budget used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(used)}
        className="flex h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className="bg-primary" style={{ width: `${spentWidth}%` }} />
        <div className="bg-amber-400" style={{ width: `${committedWidth}%` }} />
      </div>
      {showLabel && (
        <span className={cn("w-12 text-right text-xs font-medium tabular-nums", tone)}>
          {formatPercent(used)}
        </span>
      )}
    </div>
  )
}

export function SpendLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-3 text-xs text-muted-foreground", className)}>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-primary" />
        Spent
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-full bg-amber-400" />
        Committed
      </span>
    </div>
  )
}
