import type { Metadata } from "next"
import Link from "next/link"

import { SignupForm } from "@/components/auth-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Start free trial" }

export default async function SignupPage(props: PageProps<"/signup">) {
  const { next, email } = await props.searchParams
  // Arriving from an invitation: the address is fixed and we come straight back.
  const invited = typeof email === "string" ? email : undefined
  const destination = typeof next === "string" ? next : undefined

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{invited ? "Create your account" : "Start your free trial"}</CardTitle>
        <CardDescription>
          {invited
            ? "Set a password and you'll come straight back to your invitation."
            : "14 days free. No card required. Invited by your team? Sign up with the email they used."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignupForm next={destination} email={invited} />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={destination ? `/login?next=${encodeURIComponent(destination)}${invited ? `&email=${encodeURIComponent(invited)}` : ""}` : "/login"}
            className="font-medium text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
