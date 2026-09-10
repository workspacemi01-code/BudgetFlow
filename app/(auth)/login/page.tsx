import type { Metadata } from "next"
import Link from "next/link"

import { LoginForm } from "@/components/auth-forms"
import { FormMessage } from "@/components/submit-button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const metadata: Metadata = { title: "Sign in" }

export default async function LoginPage(props: PageProps<"/login">) {
  const { next, error } = await props.searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sign in</CardTitle>
        <CardDescription>Welcome back to BudgetFlow.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {typeof error === "string" && <FormMessage error={error} />}
        <LoginForm next={typeof next === "string" ? next : undefined} />
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
