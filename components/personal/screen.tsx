"use client"

import { WifiOff } from "lucide-react"

import { Block, LoadingBar } from "@/components/personal/skeleton"
import { Button } from "@/components/ui/button"
import { usePersonal, type PersonalData } from "@/hooks/use-personal"

/**
 * The bit every personal screen shares: get the data, then render.
 *
 * Why the screens read from here rather than being server components:
 *
 * Each tab used to render on the server, which meant every tap was a round
 * trip to a database a quarter of a second away — around 450ms in production
 * for a few kilobytes of numbers, and a blank page with no connection, because
 * a server-rendered navigation cannot complete offline.
 *
 * The data is fetched once and held by React Query, so switching tabs touches
 * no network at all, and the figures are still there when the connection is
 * not. The first paint is still the skeleton; every one after it is instant.
 */
export function PersonalScreen({
  budgetId,
  children,
}: {
  budgetId?: string
  children: (data: PersonalData) => React.ReactNode
}) {
  const { data, isPending, isError, refetch } = usePersonal(budgetId)

  // Only on the very first load. After that `placeholderData` hands back the
  // previous budget, so a tab switch never falls back to a skeleton.
  if (isPending) {
    return (
      <div role="status" aria-label="Loading your budget" className="space-y-4">
        <LoadingBar />
        <Block className="h-56" />
        <Block className="h-3 w-32" />
        {[0, 1, 2, 3].map((i) => (
          <Block key={i} className="h-20" />
        ))}
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  // Reached only when there is nothing cached to fall back on — offline on a
  // cold start, or a genuine failure. With a cache, this never appears.
  if (isError || !data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <WifiOff className="size-6 text-muted-foreground" aria-hidden />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Couldn&apos;t load your budget</h1>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            You may be offline. Nothing has been lost.
          </p>
        </div>
        <Button onClick={() => refetch()}>Try again</Button>
      </div>
    )
  }

  return <>{children(data)}</>
}
