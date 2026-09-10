"use client"

import Link, { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import { useState, useTransition } from "react"
import {
  ArrowLeftRight,
  Bell,
  Building2,
  ChartColumn,
  Check,
  CheckCheck,
  ChevronsUpDown,
  LayoutDashboard,
  ListTree,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react"

import { signOut } from "@/app/actions/auth"
import { switchOrg } from "@/app/actions/org"
import { Logo } from "@/components/logo"
import { BusyOverlay, Spinner } from "@/components/spinner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ROLE_LABELS, canRaiseSpend, isApprover } from "@/lib/roles"
import type { Role } from "@/lib/types"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
}

const NAV: (NavItem & { approverOnly?: boolean })[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/departments", label: "Departments", icon: Building2 },
  { href: "/budget-lines", label: "Budget lines", icon: ListTree },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/approvals", label: "Approvals", icon: CheckCheck, approverOnly: true },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/settings", label: "Settings", icon: Settings },
]

export interface ShellOrg {
  id: string
  name: string
  role: Role
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase()

function useIsActive() {
  const pathname = usePathname()
  return (href: string) => pathname === href || pathname.startsWith(`${href}/`)
}

/** A nav icon that turns into a spinner while its link is loading. Must render inside <Link>. */
function NavIcon({ icon: Icon, className }: { icon: LucideIcon; className: string }) {
  const { pending } = useLinkStatus()
  return pending ? <Spinner className={className} /> : <Icon className={className} />
}

function NavLinks({
  items,
  pendingCount,
  onNavigate,
}: {
  items: NavItem[]
  pendingCount: number
  onNavigate?: () => void
}) {
  const isActive = useIsActive()
  return (
    <nav aria-label="Main" className="grid gap-1">
      {items.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onNavigate}
          aria-current={isActive(href) ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors lg:h-9",
            isActive(href)
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          )}
        >
          <NavIcon icon={icon} className="size-4" />
          <span className="flex-1">{label}</span>
          {href === "/approvals" && pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {pendingCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  )
}

function BottomLink({ href, label, icon, badge = 0 }: NavItem & { badge?: number }) {
  const active = useIsActive()(href)
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <NavIcon icon={icon} className="size-5" />
      {label}
      {badge > 0 && (
        <span className="absolute top-2 left-1/2 ml-1.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}

function OrgSwitcher({ org, orgs, periodName }: { org: ShellOrg; orgs: ShellOrg[]; periodName: string | null }) {
  const [pending, startTransition] = useTransition()
  return (
    <>
      {pending && <BusyOverlay label="Switching organization…" />}
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={pending}
          className="flex w-full items-center gap-3 rounded-lg border bg-background px-3 py-2 text-left outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
            {initials(org.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{org.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {[periodName, ROLE_LABELS[org.role]].filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Organizations</DropdownMenuLabel>
            {orgs.map((o) => (
              <DropdownMenuItem key={o.id} onClick={() => o.id !== org.id && startTransition(() => switchOrg(o.id))}>
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.id === org.id && <Check className="text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/onboarding" />}>
            <Plus />
            Join or create organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

function UserMenu({ user, role }: { user: { name: string; email: string }; role: Role }) {
  const [pending, startTransition] = useTransition()
  return (
    <>
      {pending && <BusyOverlay label="Signing out…" />}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Account menu"
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 font-medium text-primary">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              <div className="text-sm font-medium text-foreground">{user.name}</div>
              <div className="truncate text-xs font-normal">
                {user.email} · {ROLE_LABELS[role]}
              </div>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>
            <Settings />
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/onboarding" />}>
            <Building2 />
            Join or create organization
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => startTransition(() => signOut())}>
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

export function AppShell({
  children,
  user,
  org,
  orgs,
  periodName,
  pendingCount,
  trialDaysLeft,
}: {
  children: React.ReactNode
  user: { name: string; email: string }
  org: ShellOrg
  orgs: ShellOrg[]
  periodName: string | null
  pendingCount: number
  trialDaysLeft: number | null
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const approver = isApprover(org.role)
  const nav = NAV.filter((item) => !item.approverOnly || approver)

  return (
    <div className="min-h-dvh bg-muted/40">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r bg-sidebar p-4 lg:flex">
        <Logo href="/dashboard" className="px-2 pt-1" />
        <OrgSwitcher org={org} orgs={orgs} periodName={periodName} />
        <NavLinks items={nav} pendingCount={pendingCount} />
        {trialDaysLeft !== null && (
          <div className="mt-auto rounded-lg border bg-background p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-medium text-foreground">
              Trial: {trialDaysLeft} {trialDaysLeft === 1 ? "day" : "days"} left
            </div>
            Everything is unlocked while you try BudgetFlow.
          </div>
        )}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Logo href="/dashboard" className="lg:hidden" />
          <form action="/transactions" role="search" className="relative hidden max-w-sm flex-1 sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              placeholder="Search transactions, vendors…"
              aria-label="Search transactions"
              className="h-9 pl-9"
            />
          </form>
          <div className="ml-auto flex items-center gap-1">
            {approver && (
              <Link
                href="/approvals"
                aria-label={`Notifications: ${pendingCount} awaiting approval`}
                className="relative flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:size-9"
              >
                <NavIcon icon={Bell} className="size-5 lg:size-4" />
                {pendingCount > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-red-500" />}
              </Link>
            )}
            <UserMenu user={user} role={org.role} />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pt-6 pb-28 sm:px-6 lg:px-8 lg:pb-10">{children}</main>
      </div>

      {/* Mobile / tablet bottom tab bar */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          <BottomLink href="/dashboard" label="Home" icon={LayoutDashboard} />
          <BottomLink href="/budget-lines" label="Budget" icon={ListTree} />
          {canRaiseSpend(org.role) ? (
            <div className="flex items-center justify-center">
              <Link
                href="/transactions/new"
                aria-label="New transaction"
                className="-mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background"
              >
                <NavIcon icon={Plus} className="size-6" />
              </Link>
            </div>
          ) : (
            <BottomLink href="/reports" label="Reports" icon={ChartColumn} />
          )}
          {approver ? (
            <BottomLink href="/approvals" label="Approvals" icon={CheckCheck} badge={pendingCount} />
          ) : (
            <BottomLink href="/transactions" label="Spend" icon={ArrowLeftRight} />
          )}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger className="flex flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
              <Menu className="size-5" />
              More
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)]">
              <SheetHeader>
                <SheetTitle>{org.name}</SheetTitle>
              </SheetHeader>
              <div className="space-y-3 px-4">
                <NavLinks items={nav} pendingCount={pendingCount} onNavigate={() => setMoreOpen(false)} />
                <Link
                  href="/onboarding"
                  onClick={() => setMoreOpen(false)}
                  className="block px-3 text-sm text-muted-foreground hover:text-foreground"
                >
                  {orgs.length > 1 ? "Switch, join or create an organization" : "Join or create an organization"}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}
