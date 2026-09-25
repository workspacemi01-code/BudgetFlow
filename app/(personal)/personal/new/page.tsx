import type { Metadata } from "next"
import Link from "next/link"

import { NewBudgetForm } from "@/components/personal/new-budget-form"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getBudgets, requirePersonal } from "@/lib/personal"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "New budget" }

export default async function NewPersonalBudgetPage() {
  const { profile } = await requirePersonal()
  const budgets = await getBudgets()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Start a budget</CardTitle>
        <CardDescription>
          A month of its own, or one for the whole year. You can keep both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NewBudgetForm currency={profile.currency} />
        {budgets.length > 0 && (
          <Link href="/personal" className={cn(buttonVariants({ variant: "ghost" }), "h-11 w-full")}>
            Back to my budget
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
