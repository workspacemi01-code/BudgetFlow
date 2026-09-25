import type { Metadata } from "next"
import Link from "next/link"

import { SignupForm } from "@/components/auth-forms"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Start free trial" }

export default async function SignupPage(props: PageProps<"/signup">) {
  const { next, email, type } = await props.searchParams
  // Arriving from an invitation: the address is fixed and we come straight back.
  const invited = typeof email === "string" ? email : undefined
  const destination = typeof next === "string" ? next : undefined
  // Business unless asked otherwise. That is what BudgetFlow already was, and
  // an invitation is always to an organization.
  const individual = type === "individual" && !invited

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          {invited ? "Create your account" : individual ? "Budget your own money" : "Start your free trial"}
        </CardTitle>
        <CardDescription>
          {invited
            ? "Set a password and you'll come straight back to your invitation."
            : individual
              ? "Set an amount for what you spend on, record what goes out, see what's left."
              : "14 days free. No card required. Invited by your team? Sign up with the email they used."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* An invitation is always to an organization, so offering the choice
            there would be a lie — the tabs are only for someone arriving alone. */}
        {!invited && <AccountTypeTabs individual={individual} next={destination} />}
        <SignupForm
          next={destination}
          email={invited}
          accountType={individual ? "individual" : "business"}
        />
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

/**
 * A company | Myself — as links, not client state.
 *
 * The choice lands in the URL, so it survives a refresh, can be linked to
 * straight from the marketing page, and is still right before JavaScript has
 * loaded — which on a slow phone is exactly when someone starts typing.
 */
function AccountTypeTabs({ individual, next }: { individual: boolean; next?: string }) {
  const href = (type?: "individual") => {
    const params = new URLSearchParams()
    if (type) params.set("type", type)
    if (next) params.set("next", next)
    const qs = params.toString()
    return qs ? `/signup?${qs}` : "/signup"
  }

  return (
    <div
      role="tablist"
      aria-label="What are you budgeting?"
      className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
    >
      <Tab href={href()} selected={!individual} label="A company" />
      <Tab href={href("individual")} selected={individual} label="Myself" />
    </div>
  )
}

function Tab({ href, selected, label }: { href: string; selected: boolean; label: string }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={selected}
      scroll={false}
      className={cn(
        "flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors",
        selected ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  )
}
