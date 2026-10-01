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

  /* The organisation's own palette, set on <html> so it covers portals and
     anything else rendered outside the shell. Written from a layout rather
     than the root, because the root does not know which org is open. One
     customer's colours never reach another's account. */
  const theme = ctx.org.brand_theme && ctx.org.brand_theme !== "default" ? ctx.org.brand_theme : null

  return (
    <>
      {theme && (
        <script
          /* Set before paint, so the brand colour does not flash the default
             palette first. The value is one of a fixed set the database
             constrains, and is JSON-encoded, so nothing a user typed reaches
             the page as code. */
          dangerouslySetInnerHTML={{
            __html: `document.documentElement.dataset.brand=${JSON.stringify(theme)}`,
          }}
        />
      )}
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
    </>
  )
}
