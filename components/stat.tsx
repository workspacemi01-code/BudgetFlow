import { cn } from "@/lib/utils"

export function Stat({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums">{value}</div>
    </div>
  )
}
