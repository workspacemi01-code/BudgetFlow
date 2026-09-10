import type { Metadata } from "next"
import Link from "next/link"

import { SignupForm } from "@/components/auth-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Start free trial" }

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Start your free trial</CardTitle>
        <CardDescription>14 days free. No card required. Invited by your team? Sign up with the email they used.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignupForm />
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
