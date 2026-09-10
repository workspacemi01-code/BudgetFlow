import Link from "next/link"
import { WalletCards } from "lucide-react"

import { cn } from "@/lib/utils"

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <WalletCards className="size-4" />
      </span>
      <span className="text-base">BudgetFlow</span>
    </Link>
  )
}
