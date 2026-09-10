import type { Metadata } from "next"

import { AddDepartmentDialog } from "@/components/budget-dialogs"
import { DepartmentList, DepartmentTable } from "@/components/department-table"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { getDepartmentSummaries } from "@/lib/queries"
import { isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"

export const metadata: Metadata = { title: "Departments" }

export default async function DepartmentsPage() {
  const ctx = await requireOrg()
  const rows = await getDepartmentSummaries(ctx)
  const currency = ctx.org.currency

  return (
    <>
      <PageHeader
        title="Departments"
        description={`Annual budgets${ctx.period ? ` for ${ctx.period.name}` : ""} and how much is allocated to budget lines.`}
        actions={isApprover(ctx.role) ? <AddDepartmentDialog currency={currency} /> : undefined}
      />
      <Card>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {isApprover(ctx.role)
                ? "No departments yet. Add your first one to start budgeting."
                : "You don't have access to any departments yet."}
            </p>
          ) : (
            <>
              <div className="hidden md:block">
                <DepartmentTable rows={rows} currency={currency} detailed />
              </div>
              <div className="md:hidden">
                <DepartmentList rows={rows} currency={currency} detailed />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
