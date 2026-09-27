"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"

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
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
