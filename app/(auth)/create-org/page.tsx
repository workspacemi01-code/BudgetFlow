import type { Metadata } from "next"

import { CreateOrgForm } from "@/components/auth-forms"
import { FormMessage } from "@/components/submit-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/session"

export const metadata: Metadata = { title: "Create organization" }

export default async function CreateOrgPage(props: PageProps<"/create-org">) {
  const { notice } = await props.searchParams
  await requireUser()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Create your organization</CardTitle>
        <CardDescription>You&apos;ll be its owner. You can change these later in Settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice === "confirmed" && (
          <FormMessage message="Your email is confirmed. One last step — set up your organization." />
        )}
        <CreateOrgForm />
      </CardContent>
    </Card>
  )
}
