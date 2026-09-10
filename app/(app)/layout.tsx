import { AppShell } from "@/components/app-shell"
import { getPendingCount } from "@/lib/queries"
import { isApprover } from "@/lib/roles"
import { requireOrg } from "@/lib/session"

const DAY = 86_400_000

function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / DAY))
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg()
  const pendingCount = isApprover(ctx.role) ? await getPendingCount(ctx) : 0
  const trialDaysLeft = ctx.org.plan === "trial" && ctx.org.trial_ends_at ? daysUntil(ctx.org.trial_ends_at) : null

  return (
    <AppShell
      user={{ name: ctx.userName, email: ctx.user.email ?? "" }}
      org={{ id: ctx.org.id, name: ctx.org.name, role: ctx.role }}
      orgs={ctx.memberships.map((m) => ({ id: m.org.id, name: m.org.name, role: m.role }))}
      periodName={ctx.period?.name ?? null}
      pendingCount={pendingCount}
      trialDaysLeft={trialDaysLeft}
    >
      {children}
    </AppShell>
  )
}
