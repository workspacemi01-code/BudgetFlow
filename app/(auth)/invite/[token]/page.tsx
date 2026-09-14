import type { Metadata } from "next"
import Link from "next/link"
import { MailWarning } from "lucide-react"

import { SignOutLink } from "@/components/invite-sign-out"
import { InviteDecision } from "@/components/invite-actions"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { readInvitation } from "@/lib/invites"
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from "@/lib/roles"
import { getUser } from "@/lib/session"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Your invitation" }

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <MailWarning className="size-8 text-muted-foreground" />
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{children}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-11 w-full")}>
          Go to sign in
        </Link>
      </CardContent>
    </Card>
  )
}

/**
 * Where an invitation email lands. Public on purpose: someone who hasn't got an
 * account yet still has to be able to read who invited them and to what.
 * Accepting is what requires being signed in as the invited address.
 */
export default async function InvitePage(props: PageProps<"/invite/[token]">) {
  const { token } = await props.params
  const { setup } = await props.searchParams
  const [invite, user] = await Promise.all([readInvitation(token), getUser()])

  if (invite.state === "not_found") {
    return (
      <Problem title="This invitation link isn't valid">
        Check you copied the whole link, or ask whoever invited you to send it again.
      </Problem>
    )
  }
  if (invite.state === "expired") {
    return (
      <Problem title="This invitation has expired">
        Invitations to {invite.orgName} last 7 days. Ask an owner or admin there to send you a new one.
      </Problem>
    )
  }
  if (invite.state === "used") {
    return (
      <Problem title="This invitation has already been used">
        If that was you, sign in to reach {invite.orgName}.
      </Problem>
    )
  }

  const invited = invite.email.toLowerCase()
  const signedInAs = user?.email?.toLowerCase()
  const next = `/invite/${token}`
  const withEmail = (path: string) =>
    `${path}?next=${encodeURIComponent(next)}&email=${encodeURIComponent(invite.email)}`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">You&apos;ve been invited to {invite.orgName}</CardTitle>
        <CardDescription>
          As {ROLE_LABELS[invite.role]} — {ROLE_DESCRIPTIONS[invite.role].toLowerCase()}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg bg-muted/60 p-3 text-sm">
          This invitation is for <span className="font-medium">{invite.email}</span>.
        </p>

        {!user ? (
          <div className="grid gap-2">
            <Link href={withEmail("/signup")} className={cn(buttonVariants(), "h-11")}>
              Create your account
            </Link>
            <Link href={withEmail("/login")} className={cn(buttonVariants({ variant: "outline" }), "h-11")}>
              I already have an account
            </Link>
            <p className="text-center text-xs text-muted-foreground">
              You&apos;ll come straight back here to confirm.
            </p>
          </div>
        ) : signedInAs === invited ? (
          <InviteDecision token={token} orgName={invite.orgName} setup={setup === "1"} />
        ) : (
          <div className="grid gap-2">
            <p className="text-sm text-muted-foreground">
              You&apos;re signed in as <span className="font-medium text-foreground">{user.email}</span>. Only{" "}
              {invite.email} can accept this invitation.
            </p>
            <SignOutLink />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
