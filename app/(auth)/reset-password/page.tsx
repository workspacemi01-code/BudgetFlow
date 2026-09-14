import type { Metadata } from "next"

import { ResetPasswordForm } from "@/components/auth-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireUser } from "@/lib/session"

export const metadata: Metadata = { title: "Choose a password" }

/**
 * Reached from the reset email, and from an invitation: an account created by
 * an invitation has no password yet, so it lands here (?setup=1) after joining.
 */
export default async function ResetPasswordPage(props: PageProps<"/reset-password">) {
  const { setup } = await props.searchParams
  const first = setup === "1"
  const user = await requireUser()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{first ? "Set your password" : "Choose a new password"}</CardTitle>
        <CardDescription>
          {first ? `Last step — this is how you'll sign in as ${user.email}.` : `For ${user.email}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm
          label={first ? "Password" : "New password"}
          submitLabel={first ? "Save and continue" : "Save new password"}
        />
      </CardContent>
    </Card>
  )
}
