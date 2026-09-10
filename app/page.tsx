import Link from "next/link"
import {
  ArrowRight,
  BellRing,
  Building2,
  Check,
  CheckCheck,
  FileSpreadsheet,
  Globe,
  History,
  ListTree,
  Smartphone,
} from "lucide-react"

import { Logo } from "@/components/logo"
import { SpendLegend, UtilBar } from "@/components/util-bar"
import { buttonVariants } from "@/components/ui/button"
import { formatMoney } from "@/lib/format"
import { cn } from "@/lib/utils"

// Illustration for the hero card only — not anyone's data.
const PREVIEW = {
  period: "FY2026",
  currency: "NGN",
  budget: 290_000_000,
  committed: 35_500_000,
  available: 169_500_000,
  departments: [
    { name: "Marketing", budget: 100_000_000, spent: 17_200_000, committed: 22_200_000 },
    { name: "Sales", budget: 70_000_000, spent: 15_400_000, committed: 3_000_000 },
    { name: "Operations", budget: 55_000_000, spent: 23_200_000, committed: 0 },
    { name: "Human Resources", budget: 25_000_000, spent: 4_500_000, committed: 5_300_000 },
  ],
}

const FEATURES = [
  { icon: Building2, title: "Department budgets", body: "Set an annual budget per department and split it into brand and category lines." },
  { icon: CheckCheck, title: "Approval workflow", body: "Spend is raised, approved by Finance, then paid — every step is tracked." },
  { icon: ListTree, title: "Always-accurate balances", body: "Spent, committed and available are calculated live, never typed in by hand." },
  { icon: Smartphone, title: "Approve from your phone", body: "Managers raise and approve spend from any device. Installs like an app." },
  { icon: History, title: "Full audit trail", body: "Nothing is deleted. Every change records who did it, when, and what changed." },
  { icon: Globe, title: "Global and local", body: "Any currency, any fiscal-year start, local date and number formats." },
  { icon: FileSpreadsheet, title: "Import from Excel", body: "Bring your existing budget spreadsheet across in minutes." },
  { icon: BellRing, title: "Threshold alerts", body: "Get told when a line passes 80% or 100% — before it becomes a problem." },
]

const STEPS = [
  { title: "Create your organization", body: "Sign up, then set your currency and fiscal year." },
  { title: "Set department budgets", body: "Add departments and split each budget into lines." },
  { title: "Raise and approve spend", body: "Teams raise requests; Finance approves and pays." },
  { title: "Track in real time", body: "See budget, spent, committed and available at a glance." },
]

const PLANS = [
  {
    name: "Starter",
    price: "Free",
    period: "",
    blurb: "For small teams getting off spreadsheets.",
    features: ["Up to 3 users", "Up to 3 departments", "Transactions & approvals", "CSV export"],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Growth",
    price: "$49",
    period: "/month",
    blurb: "For growing companies with several departments.",
    features: ["Up to 25 users", "Unlimited departments", "Alerts & monthly reports", "Excel import", "Audit log"],
    cta: "Start 14-day trial",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    blurb: "For larger organizations with complex approvals.",
    features: ["Unlimited users", "Multi-step approvals", "Single sign-on (SSO)", "Priority support"],
    cta: "Talk to us",
    highlight: false,
  },
]

export default function LandingPage() {
  const previewStats = [
    { label: "Budget", value: PREVIEW.budget },
    { label: "Committed", value: PREVIEW.committed },
    { label: "Available", value: PREVIEW.available },
  ]

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#pricing" className="hover:text-foreground">Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/login" className={cn(buttonVariants({ variant: "ghost" }), "h-10 px-3")}>
              Sign in
            </Link>
            <Link href="/signup" className={cn(buttonVariants(), "h-10 px-4")}>
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div className="space-y-6">
            <span className="inline-flex items-center rounded-full border bg-muted/60 px-3 py-1 text-xs font-medium text-muted-foreground">
              Budget planning for growing teams
            </span>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Know what every department can still spend.
            </h1>
            <p className="max-w-lg text-lg text-pretty text-muted-foreground">
              BudgetFlow replaces budget spreadsheets. Set department budgets, approve spend, and see
              what&apos;s committed and available in real time — on any device.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/signup" className={cn(buttonVariants(), "h-12 px-6 text-base")}>
                Start free trial
                <ArrowRight />
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-12 px-6 text-base")}>
                Sign in
              </Link>
            </div>
            <p className="text-sm text-muted-foreground">14-day free trial · No card required</p>
          </div>

          <div aria-hidden className="rounded-2xl border bg-muted/40 p-3 shadow-sm sm:p-4">
            <div className="space-y-5 rounded-xl border bg-background p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">{PREVIEW.period} overview</div>
                <SpendLegend />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {previewStats.map((stat) => (
                  <div key={stat.label} className="rounded-lg bg-muted/60 p-3">
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                    <div className="text-base font-semibold tabular-nums sm:text-lg">
                      {formatMoney(stat.value, PREVIEW.currency, { compact: true })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                {PREVIEW.departments.map((row) => (
                  <div key={row.name} className="space-y-1.5">
                    <div className="flex justify-between gap-2 text-sm">
                      <span>{row.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatMoney(row.budget - row.spent - row.committed, PREVIEW.currency, { compact: true })} left
                      </span>
                    </div>
                    <UtilBar budget={row.budget} spent={row.spent} committed={row.committed} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Everything finance needs, nothing it doesn&apos;t</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">
              Built around how budgets actually work: departments, lines, requests, approvals and payments.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border bg-background p-5">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <h3 className="mt-4 font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <h2 className="text-3xl font-semibold tracking-tight">Up and running in an afternoon</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="space-y-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="pricing" className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <h2 className="text-3xl font-semibold tracking-tight">Simple pricing</h2>
            <p className="mt-2 text-muted-foreground">Start free. Upgrade when your team grows.</p>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={cn(
                    "flex flex-col rounded-xl border bg-background p-6",
                    plan.highlight && "border-primary ring-2 ring-primary/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{plan.name}</h3>
                    {plan.highlight && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Most popular
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-semibold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{plan.blurb}</p>
                  <ul className="mt-6 flex-1 space-y-2 text-sm">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2">
                        <Check className="size-4 text-primary" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={cn(
                      buttonVariants({ variant: plan.highlight ? "default" : "outline" }),
                      "mt-6 h-11"
                    )}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Ready to retire the budget spreadsheet?</h2>
          <p className="mt-2 text-muted-foreground">Set up your organization in minutes.</p>
          <Link href="/signup" className={cn(buttonVariants(), "mt-6 h-12 px-6 text-base")}>
            Start free trial
            <ArrowRight />
          </Link>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <span>© 2026 BudgetFlow</span>
          <span>Budget planning & spend tracking</span>
        </div>
      </footer>
    </div>
  )
}
