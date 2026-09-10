import { badgeVariants } from "@/components/ui/badge"
import type { TxnStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export const STATUS_LABELS: Record<TxnStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  partially_paid: "Part paid",
  paid: "Paid",
  rejected: "Rejected",
  voided: "Voided",
}

const STATUS_CLASSES: Record<TxnStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  approved: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  partially_paid: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300",
  paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300",
  voided: "bg-muted text-muted-foreground line-through",
}

export function StatusBadge({ status }: { status: TxnStatus }) {
  return (
    <span className={cn(badgeVariants({ variant: "secondary" }), STATUS_CLASSES[status])}>
      {STATUS_LABELS[status]}
    </span>
  )
}
