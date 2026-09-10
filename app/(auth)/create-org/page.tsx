import type { Metadata } from "next"

import { CreateOrgForm } from "@/components/auth-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/session"

export const metadata: Metadata = { title: "Create organization" }

export default async function CreateOrgPage() {
  await requireUser()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create your organization</CardTitle>
        <CardDescription>You&apos;ll be its owner. You can change these later in Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <CreateOrgForm />
      </CardContent>
    </Card>
  )
}
