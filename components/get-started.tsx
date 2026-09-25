import Link from "next/link"
import { ArrowRight, Building2, ListTree, Plus, UserPlus } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isAdmin, isApprover } from "@/lib/roles"
import type { Role } from "@/lib/types"

/** First-run checklist for a brand-new organization. */
export function GetStarted({ role, orgName }: { role: Role; orgName: string }) {
  if (!isApprover(role)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Nothing to show yet</CardTitle>
          <CardDescription>
            {role === "dept_manager"
              ? "You haven't been given a department yet. Ask an owner or admin to assign you one in Settings."
              : `${orgName} hasn't set up its budget yet. Departments will show up here once Finance adds them.`}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const steps = [
    {
      icon: Building2,
      title: "Add your departments",
      body: "Give each department its annual budget for this financial year.",
      href: "/departments",
      cta: "Add departments",
    },
    {
      icon: ListTree,
      title: "Split budgets into lines",
      body: "Break each department down by category. Spend is raised against a line.",
      href: "/budget-lines",
      cta: "Add budget lines",
    },
    ...(isAdmin(role)
      ? [
          {
            icon: UserPlus,
            title: "Invite your team",
            body: "Finance approves and pays; department managers raise spend for their departments.",
            href: "/settings",
            cta: "Invite people",
          },
        ]
      : []),
    {
      icon: Plus,
      title: "Raise the first spend",
      body: "Requests count against the budget as soon as they're approved.",
      href: "/transactions/new",
      cta: "New transaction",
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set up {orgName}</CardTitle>
        <CardDescription>A few steps and your budget is live.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-2">
          {steps.map(({ icon: Icon, title, body, href, cta }, index) => (
            <li key={title} className="flex gap-3 rounded-lg border p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 space-y-1">
                <div className="font-medium">
                  {index + 1}. {title}
                </div>
                <p className="text-sm text-muted-foreground">{body}</p>
                <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                  {cta}
                  <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
