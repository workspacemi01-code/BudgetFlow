import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm, ResendConfirmationForm } from "@/components/auth-forms"
import { FormMessage } from "@/components/submit-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Sign in" }

const LINK_ERRORS: Record<string, string> = {
  link_expired: "That confirmation link has expired or was already used. If you've confirmed already, just sign in.",
  reset_expired: "That password reset link has expired or was already used.",
}

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error, email } = await props.searchParams
  const code = typeof error === "string" ? error : undefined
  // An invitation link sends people here pinned to the address it was sent to.
  const invited = typeof email === "string" ? email : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>
          {invited ? "Sign in to accept your invitation." : "Welcome back to BudgetFlow."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {code && <FormMessage error={LINK_ERRORS[code] ?? code} />}
        {code === "reset_expired" && (
          <Link href="/forgot-password" className="block text-center text-sm font-medium text-primary hover:underline">
            Send a new reset link
          </Link>
        )}
        <LoginForm next={typeof next === "string" ? next : undefined} email={invited} />
        {code === "link_expired" && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Need a new confirmation link?</p>
            <ResendConfirmationForm />
          </div>
        )}
        <p className="text-center text-sm text-muted-foreground">
          New to BudgetFlow?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Start a free trial
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
