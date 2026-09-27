import { Logo } from "@/components/logo"
import { UserMenu } from "@/components/personal-user-menu"
import { OfflineBar } from "@/components/personal/offline-bar"
import { requirePersonal } from "@/lib/personal"

/**
 * The individual shell.
 *
 * Deliberately not the business AppShell: that one carries an organization
 * switcher, a department nav, a pending-approvals badge and a trial banner,
 * none of which mean anything to one person budgeting their own money. This is
 * a header and the page — most of the screen is the budget, and on a phone
 * that is the whole point.
 */
export default async function PersonalLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requirePersonal()

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <OfflineBar />
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between gap-3 px-4">
          {/* Logo renders its own <Link>, so wrapping it in another produced
              an <a> inside an <a> — invalid HTML, and React warns that it
              breaks hydration. It takes the destination as a prop instead. */}
          <Logo href="/personal" />
          <UserMenu name={profile.displayName ?? user.name} email={user.email} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  )
}
