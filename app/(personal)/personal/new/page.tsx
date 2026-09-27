import type { Metadata } from "next"

import { BackLink } from "@/components/back-link"
import { NewBudgetForm } from "@/components/personal/new-budget-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePersonal } from "@/lib/personal"

export const metadata: Metadata = { title: "New budget" }

export default async function NewPersonalBudgetPage() {
  const { profile } = await requirePersonal()

  return (
    <>
      <BackLink fallbackHref="/personal" />
      <Card>
        <CardHeader>
        <CardTitle className="text-lg">Start a budget</CardTitle>
        <CardDescription>
          A month of its own, or one for the whole year. You can keep both.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <NewBudgetForm currency={profile.currency} />
      </CardContent>
      </Card>
    </>
  )
}
