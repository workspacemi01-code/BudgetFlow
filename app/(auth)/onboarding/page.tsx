import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { AcceptInviteButton } from "@/components/accept-invite-button"
import { FormMessage } from "@/components/submit-button"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ROLE_LABELS } from "@/lib/roles"
import { getMemberships, getPendingInvites, requireUser } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Get started" }

export default async function OnboardingPage(props: PageProps<"/onboarding">) {
  const { notice } = await props.searchParams
  const confirmed = notice === "confirmed"
  const user = await requireUser()
  const [invites, memberships] = await Promise.all([getPendingInvites(), getMemberships()])
  if (invites.length === 0 && memberships.length === 0) redirect(confirmed ? "/create-org?notice=confirmed" : "/create-org")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{invites.length > 0 ? "You've been invited" : "Your organizations"}</CardTitle>
        <CardDescription>Signed in as {user.email}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {confirmed && <FormMessage message="Your email is confirmed — welcome to BudgetFlow." />}
        {invites.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {invites.map((invite) => (
              <li key={invite.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <div className="truncate font-medium">{invite.orgName}</div>
                  <div className="text-xs text-muted-foreground">as {ROLE_LABELS[invite.role]}</div>
                </div>
                <AcceptInviteButton token={invite.token} />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-2">
          {memberships.length > 0 && (
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
              Back to dashboard
            </Link>
          )}
          <Link href="/create-org" className={cn(buttonVariants({ variant: "ghost" }), "h-11")}>
            Create a new organization instead
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
