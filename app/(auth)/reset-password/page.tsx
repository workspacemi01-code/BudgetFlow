import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/auth-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/session"

export const metadata: Metadata = { title: "Choose a new password" }

/** Reached from the reset email: /auth/confirm signs the user in, then sends them here. */
export default async function ResetPasswordPage() {
  const user = await requireUser()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Choose a new password</CardTitle>
        <CardDescription>For {user.email}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  )
}
