"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { HISTORY_BASELINE_KEY } from "@/app/providers"
import { cn } from "@/lib/utils"

/**
 * The way back from any screen that is not a tab.
 *
 * Tabs need no back button — the bar is always there. Everything else does, and
 * most of ours had none: recording a spend, starting a budget and raising a
 * transaction all opened a screen with no visible exit. On a phone that is a
 * dead end, because there is no browser chrome to fall back on, and Android's
 * hardware back is the only escape most people would not think to use.
 *
 * `router.back()` with a fallback, not a plain link, for two reasons. Going
 * back should return you to wherever you actually came from — a category screen
 * reached from Home should return to Home, not to a fixed route. But
 * `router.back()` alone does nothing when there is no history, which is exactly
 * what happens when a link is opened in a new tab or from a notification. So
 * the fallback runs when this is the first entry in the session.
 */
export function BackLink({
  fallbackHref,
  label = "Back",
  className,
}: {
  /** Where to go when there is no history to go back to. */
  fallbackHref: string
  label?: string
  className?: string
}) {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => {
        // Compared against where history stood when the session began, not
        // against 1 — a new tab already has about:blank behind it, and
        // history.back() would land the person on a blank page.
        const raw = sessionStorage.getItem(HISTORY_BASELINE_KEY)
        const baseline = raw === null ? window.history.length : Number(raw)
        if (window.history.length > baseline) router.back()
        else router.push(fallbackHref)
      }}
      className={cn(
        // Tall enough to hit with a thumb, and pulled left so the arrow lines
        // up with the content edge rather than floating in from it.
        "-ml-2 inline-flex h-11 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden />
      {label}
    </button>
  )
}
