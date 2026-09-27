"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useState } from "react"

/**
 * The client-side cache.
 *
 * React Query was already a dependency and was never wired up, which is why
 * every screen went back to the server for numbers it had just fetched.
 *
 * staleTime is deliberately generous: a personal budget changes when *you*
 * change it, and every mutation invalidates the cache itself, so re-fetching on
 * a timer would spend a round trip to learn nothing.
 */
/**
 * How many entries were already in history when this session started.
 *
 * Recorded here because this mounts once, before any in-app navigation. A back
 * button needs to know whether there is anywhere of *ours* to go back to, and
 * history.length alone cannot tell it: a freshly opened tab already has
 * about:blank behind it, so "length > 1" sends you to a blank page.
 */
export const HISTORY_BASELINE_KEY = "bf:history-baseline"

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 24 * 60 * 60_000,
            // Offline or a flaky connection: keep showing what we have rather
            // than blanking the screen. This is the difference between a
            // budget that still reads on the underground and a white page.
            retry: 2,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
        },
      }),
  )
  useEffect(() => {
    // Only the first time in this tab — later mounts must not move the mark.
    if (sessionStorage.getItem(HISTORY_BASELINE_KEY) === null) {
      sessionStorage.setItem(HISTORY_BASELINE_KEY, String(window.history.length))
    }
  }, [])

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
