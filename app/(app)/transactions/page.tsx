import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { TransactionsTable } from "@/components/transactions-table"
import { buttonVariants } from "@/components/ui/button"
import { getTransactions } from "@/lib/queries"
import { canRaiseSpend } from "@/lib/roles"
import { requireOrg } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Transactions" }

export default async function TransactionsPage(props: PageProps<"/transactions">) {
  const { q } = await props.searchParams
  const ctx = await requireOrg()
  const rows = await getTransactions(ctx)
  const departments = [...new Set(rows.map((t) => t.departmentName))].sort()

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`Every spend request raised against a budget line${ctx.period ? ` in ${ctx.period.name}` : ""}, newest first.`}
        actions={
          canRaiseSpend(ctx.role) ? (
            <Link href="/transactions/new" className={cn(buttonVariants(), "h-10 px-4")}>
              <Plus />
              New transaction
            </Link>
          ) : undefined
        }
      />
      <TransactionsTable
        rows={rows}
        departments={departments}
        currency={ctx.org.currency}
        initialQuery={typeof q === "string" ? q : ""}
      />
    </>
  )
}
