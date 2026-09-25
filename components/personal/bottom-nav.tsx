"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, List, Plus, PieChart, MoreHorizontal } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The tab bar, fixed to the bottom of the screen.
 *
 * Every money app people already use is laid out this way, and for a good
 * reason on a phone: the bottom is where your thumb is. Adding a spend sits in
 * the middle as a raised button rather than a fifth equal tab, because it is
 * the one thing done many times a day while everything else is done
 * occasionally.
 *
 * It clears the home indicator with env(safe-area-inset-bottom); the page above
 * leaves room for it so the last row of content is never sat on.
 */
export function BottomNav({ budgetId }: { budgetId: string }) {
  const pathname = usePathname()
  const base = `/personal/${budgetId}`

  const tabs = [
    { href: base, label: "Home", icon: Home, exact: true },
    { href: `${base}/budget`, label: "Budget", icon: PieChart },
    { href: `${base}/activity`, label: "Activity", icon: List },
    { href: `${base}/more`, label: "More", icon: MoreHorizontal },
  ]

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href)

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="mx-auto flex h-16 w-full max-w-2xl items-stretch justify-around px-2">
        {tabs.slice(0, 2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href, tab.exact)} />
        ))}

        {/* Raised, and labelled — an unlabelled plus is a guess. */}
        <Link
          href={`${base}/add`}
          aria-label="Record a spend"
          className="flex w-16 shrink-0 flex-col items-center justify-center"
        >
          <span
            className={cn(
              "flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95",
              pathname.startsWith(`${base}/add`) && "ring-2 ring-primary/40 ring-offset-2"
            )}
          >
            <Plus className="size-6" aria-hidden />
          </span>
        </Link>

        {tabs.slice(2).map((tab) => (
          <Tab key={tab.href} {...tab} active={isActive(tab.href, tab.exact)} />
        ))}
      </div>
    </nav>
  )
}

function Tab({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof Home
  active: boolean
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      <Icon className="size-5" aria-hidden />
      {label}
    </Link>
  )
}
